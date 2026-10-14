import { describe, expect, it } from "vitest";
import { Bash } from "../Bash.js";
import { InMemoryFs } from "../fs/in-memory-fs/index.js";
import type { IFileSystem } from "../fs/interface.js";

/**
 * Every async IFileSystem call the interpreter makes, as `name(arg0,arg1)`.
 * Remote backends pay a round trip per call, so the sequence is the contract.
 */
function recordingFs(): { fs: IFileSystem; calls: string[] } {
  const inner = new InMemoryFs();
  const calls: string[] = [];
  const fs = new Proxy(inner, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      if (key === "resolvePath" || key === "getAllPaths") {
        return value.bind(target);
      }
      return (...args: unknown[]) => {
        const shown = args
          .slice(0, 2)
          .map((arg) => (typeof arg === "string" ? JSON.stringify(arg) : "…"))
          .join(",");
        calls.push(`${String(key)}(${shown})`);
        return value.apply(target, args);
      };
    },
  }) as IFileSystem;
  return { fs, calls };
}

async function callsFor(
  script: string,
  setup = "echo seed > existing.log",
): Promise<string[]> {
  const { fs, calls } = recordingFs();
  const bash = new Bash({ fs, cwd: "/home/user" });
  await bash.exec(setup);
  calls.length = 0;
  await bash.exec(script);
  return calls;
}

const WARM = "echo seed > existing.log; printf '' > /dev/null; cat < /dev/null";

describe("backend calls per output redirect", () => {
  it("truncates `: > f` with one stat and one write", async () => {
    expect(await callsFor(": > existing.log")).toEqual([
      'stat("/home/user/existing.log")',
      'writeFile("/home/user/existing.log","")',
    ]);
  });

  it.each([
    [
      "echo r > existing.log",
      [
        'stat("/home/user/existing.log")',
        'stat("/usr/bin/echo")',
        'writeFile("/home/user/existing.log","r\\n")',
      ],
    ],
    [
      "echo r >> existing.log",
      [
        'stat("/home/user/existing.log")',
        'stat("/usr/bin/echo")',
        'appendFile("/home/user/existing.log","r\\n")',
      ],
    ],
    [
      "echo r > new.txt",
      [
        'stat("/home/user/new.txt")',
        'stat("/usr/bin/echo")',
        'writeFile("/home/user/new.txt","r\\n")',
      ],
    ],
    [
      "printf '%s\\n' x >> existing.log",
      [
        'stat("/home/user/existing.log")',
        'stat("/usr/bin/printf")',
        'appendFile("/home/user/existing.log","x\\n")',
      ],
    ],
    [
      "cat <<EOF > heredoc.txt\nr\nEOF",
      [
        'stat("/home/user/heredoc.txt")',
        'stat("/usr/bin/cat")',
        'writeFile("/home/user/heredoc.txt","r\\n")',
      ],
    ],
    [
      "cat > heredoc.txt <<'EOF'\nr\nEOF",
      [
        'stat("/home/user/heredoc.txt")',
        'stat("/usr/bin/cat")',
        'writeFile("/home/user/heredoc.txt","r\\n")',
      ],
    ],
    [
      "v=r; cat > heredoc.txt <<EOF\n$v\nEOF",
      [
        'stat("/home/user/heredoc.txt")',
        'stat("/usr/bin/cat")',
        'writeFile("/home/user/heredoc.txt","r\\n")',
      ],
    ],
    [
      "echo -n > existing.log",
      [
        'stat("/home/user/existing.log")',
        'stat("/usr/bin/echo")',
        'writeFile("/home/user/existing.log","")',
      ],
    ],
    [
      "echo hi > a.txt > b.txt",
      [
        'stat("/home/user/a.txt")',
        'writeFile("/home/user/a.txt","")',
        'stat("/home/user/b.txt")',
        'stat("/usr/bin/echo")',
        'writeFile("/home/user/b.txt","hi\\n")',
      ],
    ],
  ])("folds the open of %j into its one write", async (script, calls) => {
    expect(await callsFor(script, WARM)).toEqual(calls);
  });

  it.each([
    [
      "echo hi > existing.log 2>&1",
      [
        'stat("/home/user/existing.log")',
        'writeFile("/home/user/existing.log","")',
        'stat("/usr/bin/echo")',
        'writeFile("/home/user/existing.log","hi\\n")',
      ],
    ],
    [
      "cat existing.log > copy.txt",
      [
        'stat("/home/user/copy.txt")',
        'writeFile("/home/user/copy.txt","")',
        'stat("/usr/bin/cat")',
        'readFileBytes("/home/user/existing.log")',
        'writeFile("/home/user/copy.txt","seed\\n")',
      ],
    ],
    [
      "set -C; echo hi > new.txt",
      [
        'stat("/home/user/new.txt")',
        'writeFile("/home/user/new.txt","")',
        'stat("/usr/bin/echo")',
        'writeFile("/home/user/new.txt","hi\\n")',
      ],
    ],
  ])("keeps the eager open for %j", async (script, calls) => {
    expect(await callsFor(script, WARM)).toEqual(calls);
  });
});

/** A backend whose exists() is the usual try/catch around stat(). */
class StatFailsFs extends InMemoryFs {
  override async stat(path: string) {
    if (path === "/guarded") {
      throw Object.assign(new Error("EIO: i/o error, stat '/guarded'"), {
        code: "EIO",
      });
    }
    return super.stat(path);
  }

  override async exists(path: string): Promise<boolean> {
    try {
      await this.stat(path);
      return true;
    } catch {
      return false;
    }
  }
}

describe("output redirect target stat errors", () => {
  it("refuses the redirect under noclobber instead of clobbering", async () => {
    const fs = new StatFailsFs({ "/guarded": "precious\n" });
    const result = await new Bash({ fs }).exec(
      "set -C; echo hi > /guarded; echo rc=$?",
    );
    expect(result.stdout).toBe("rc=1\n");
    expect(result.stderr).toBe("bash: /guarded: cannot open redirect target\n");
    expect(await fs.readFile("/guarded")).toBe("precious\n");
  });
});
