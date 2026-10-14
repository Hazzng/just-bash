/**
 * Harness for the deferral differential tests: the same script runs on a
 * runtime with the output-open deferral and on one with it forced off, and
 * the two must agree on stdout, stderr, exit code and the final file tree.
 */
// @banned-pattern-ignore: test helper; a read-only OverlayFs needs a real root directory
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, expect, it, vi } from "vitest";
import type { ExecutionLimits } from "../limits.js";
import type { Command, ExecResult } from "../types.js";

export type DifferentialCase = {
  name: string;
  script: string;
  files?: Record<string, string>;
  dirs?: string[];
  /**
   * `strict`: a write under a missing or non-directory parent throws
   * ENOENT/ENOTDIR like a real kernel. `ro`: a read-only OverlayFs.
   */
  fs?: "mem" | "strict" | "ro";
  limits?: ExecutionLimits;
  execArgs?: string[];
  /** A host command of this name that reads `f` before answering. */
  shadow?: string;
  /** Why the two runtimes are allowed to disagree; the test then fails if they agree. */
  knownDifference?: string;
};

type Runtime = typeof import("../index.js");

type Outcome = {
  stdout: string;
  stderr: string;
  exitCode: number | string;
  files: Record<string, string>;
};

async function loadRuntime(defer: boolean): Promise<Runtime> {
  vi.resetModules();
  if (defer) {
    vi.doUnmock("./pure-output.js");
  } else {
    vi.doMock("./pure-output.js", async (importOriginal) => ({
      ...(await importOriginal<typeof import("./pure-output.js")>()),
      deferrableOutputOpen: () => -1,
    }));
  }
  return import("../index.js");
}

const errno = (code: string, path: string) =>
  Object.assign(new Error(`${code}: ${path}`), { code });

function strictFs<T extends object>(inner: T): T {
  return new Proxy(inner, {
    get(target, key) {
      // @banned-pattern-ignore: keys are the interpreter's own IFileSystem method lookups, never user input
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      if (key !== "writeFile" && key !== "appendFile")
        return value.bind(target);
      return async (path: string, ...rest: unknown[]) => {
        const parent = path.slice(0, path.lastIndexOf("/")) || "/";
        const fs = target as {
          exists(p: string): Promise<boolean>;
          stat(p: string): Promise<{ isDirectory: boolean }>;
        };
        if (!(await fs.exists(parent))) throw errno("ENOENT", path);
        if (!(await fs.stat(parent)).isDirectory) throw errno("ENOTDIR", path);
        return value.call(target, path, ...rest);
      };
    },
  });
}

const shadowCommand = (name: string): Command => ({
  name,
  async execute(args, ctx): Promise<ExecResult> {
    const seen = await ctx.fs
      .readFile(ctx.fs.resolvePath(ctx.cwd, "f"))
      .catch(() => "<missing>");
    return {
      stdout: `${name}[${seen}] ${args.join(" ")}\n`,
      stderr: "",
      exitCode: 0,
    };
  },
});

async function outcome(mod: Runtime, c: DifferentialCase): Promise<Outcome> {
  let root: string | undefined;
  let cwd = "/home/user";
  let fs:
    | InstanceType<typeof mod.InMemoryFs>
    | InstanceType<typeof mod.OverlayFs>;
  if (c.fs === "ro") {
    root = mkdtempSync(join(tmpdir(), "deferral-ro-"));
    fs = new mod.OverlayFs({ root, mountPoint: "/ro", readOnly: true });
    cwd = "/ro";
  } else {
    fs = new mod.InMemoryFs();
    await fs.mkdir(cwd, { recursive: true });
    for (const dir of c.dirs ?? []) await fs.mkdir(`${cwd}/${dir}`);
    for (const [name, content] of Object.entries(c.files ?? {})) {
      await fs.writeFile(`${cwd}/${name}`, content);
    }
  }
  const bash = new mod.Bash({
    fs: c.fs === "strict" ? strictFs(fs) : fs,
    cwd,
    executionLimits: c.limits,
    customCommands: c.shadow ? [shadowCommand(c.shadow)] : undefined,
  });
  let result: ExecResult | { stdout: string; stderr: string; exitCode: string };
  try {
    result = await bash.exec(c.script, { args: c.execArgs });
  } catch (error) {
    result = {
      stdout: "",
      stderr: `thrown: ${String(error)}`,
      exitCode: "thrown",
    };
  }
  const files: Record<string, string> = Object.create(null);
  const walk = async (dir: string, rel: string) => {
    for (const name of (await fs.readdir(dir)).sort()) {
      const path = `${dir}/${name}`;
      const key = rel ? `${rel}/${name}` : name;
      if ((await fs.stat(path)).isDirectory) await walk(path, key);
      else files[key] = await fs.readFile(path);
    }
  };
  await walk(cwd, "");
  if (root) rmSync(root, { recursive: true, force: true });
  return {
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    files,
  };
}

async function writesFor(mod: Runtime, script: string): Promise<number> {
  const inner = new mod.InMemoryFs();
  let writes = 0;
  const fs = new Proxy(inner, {
    get(target, key) {
      // @banned-pattern-ignore: keys are the interpreter's own IFileSystem method lookups, never user input
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      if (key === "writeFile" || key === "appendFile") {
        return (...args: unknown[]) => {
          writes++;
          return value.apply(target, args);
        };
      }
      return value.bind(target);
    },
  });
  const bash = new mod.Bash({ fs, cwd: "/home/user" });
  await bash.exec("echo warm > /dev/null");
  writes = 0;
  await bash.exec(script);
  return writes;
}

/** Registers one test per case; the deferred and the eager runtime must agree exactly. */
export function itAgreesOnEveryCase(cases: DifferentialCase[]): void {
  let eager: Runtime;
  let deferred: Runtime;
  beforeAll(async () => {
    eager = await loadRuntime(false);
    deferred = await loadRuntime(true);
  }, 60_000);
  it("tells the two runtimes apart by their writes for `echo r > f`", async () => {
    expect(await writesFor(eager, "echo r > f")).toBe(2);
    expect(await writesFor(deferred, "echo r > f")).toBe(1);
  });
  for (const c of cases) {
    const check = async () => {
      const expected = await outcome(eager, c);
      expect(await outcome(deferred, c)).toEqual(expected);
    };
    if (c.knownDifference) {
      it.fails(`${c.name} (known difference: ${c.knownDifference})`, check);
    } else {
      it(c.name, check);
    }
  }
}
