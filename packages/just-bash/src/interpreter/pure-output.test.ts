import { describe, expect, it } from "vitest";
import type { SimpleCommandNode } from "../ast/types.js";
import { catCommand } from "../commands/cat/cat.js";
import { echoCommand } from "../commands/echo/echo.js";
import { printfCommand } from "../commands/printf/printf.js";
import { unsafeBytesFromLatin1 } from "../encoding.js";
import type { IFileSystem } from "../fs/interface.js";
import { resolveLimits } from "../limits.js";
import { Parser } from "../parser/parser.js";
import type { RuntimeCommand, RuntimeCommandContext } from "../types.js";
import { findDeferrableTail, PURE_OUTPUT_COMMANDS } from "./pure-output.js";

const redirectionsOf = (script: string) => {
  const statement = new Parser().parse(script).statements[0];
  const command = statement.pipelines[0].commands[0] as SimpleCommandNode;
  return command.redirections;
};

const tailOf = (script: string, namerefs: string[] = []) =>
  findDeferrableTail(redirectionsOf(script), new Set(namerefs));

describe("findDeferrableTail", () => {
  it.each([
    ["echo hi > f", 0],
    ["echo hi >> f", 0],
    ["echo hi >| f", 0],
    ["echo hi &> f", 0],
    ["echo hi &>> f", 0],
    ["echo hi 1> f", 0],
    ["echo hi 2>&1 > f", 1],
    ["echo hi > a > b", 1],
    ["echo hi 2> log > f", 1],
    ["echo hi > f <<EOF > g\nx\nEOF", 2],
    ["cat <<EOF > f\n$(cat f)\nEOF", 1],
    ["cat > f <<'EOF'\n$(cat f)\nEOF", 0],
    ["cat > f <<EOF\nplain\nEOF", 0],
    ['cat > f <<EOF\n$x ${y} "$z" ~ \\$\n$1 $? $@\nEOF', 0],
    ["cat > f <<-EOF\n\t$x\n\tEOF", 0],
    ['cat > f <<< "$x"', 0],
    ["cat > f <<< literal", 0],
    ["cat > f <<EOF <<< x\n$x\nEOF", 0],
  ])("admits the tail of %j at %i", (script, index) => {
    expect(tailOf(script)).toBe(index);
  });

  it.each([
    "echo hi",
    "echo hi 2> f",
    "echo hi 3> f",
    "echo hi {fd}> f",
    "echo hi > f 2>&1",
    "echo hi > f 1>&2",
    "echo hi > f >& g",
    "echo hi > f < in",
    "cat > f 0<> f",
    "cat > f 3< f <&3",
    "cat > f < <(cat f)",
    "cat > f 3<<EOF\nx\nEOF",
    "cat > f {x}<<EOF\nx\nEOF",
    "cat > f <<EOF\n$(cat f)\nEOF",
    "cat > f <<EOF\n$((1 + 1))\nEOF",
    "cat > f <<EOF\n${x:-$(cat f)}\nEOF",
    "cat > f <<EOF\n${!ref}\nEOF",
    "cat > f <<EOF\n${#x}\nEOF",
    "cat > f <<EOF\n${a[0]}\nEOF",
    'cat > f <<< "$(cat f)"',
    "cat > f <<< $x*",
  ])("keeps %j eager", (script) => {
    expect(tailOf(script)).toBe(-1);
  });

  it("keeps a nameref in a later heredoc eager", () => {
    const script = "cat > f <<EOF\n$r\nEOF";
    expect(tailOf(script)).toBe(0);
    expect(tailOf(script, ["r"])).toBe(-1);
  });
});

const IMPLEMENTATIONS = new Map<string, RuntimeCommand>([
  ["cat", catCommand],
  ["echo", echoCommand],
  ["printf", printfCommand],
]);

/**
 * A context that records, then refuses, every filesystem access and every
 * shell-state write. Reads of the environment are allowed: they cannot
 * observe the redirect target.
 */
function sealedContext(): { ctx: RuntimeCommandContext; touched: string[] } {
  const touched: string[] = [];
  const refuse = (what: string): never => {
    touched.push(what);
    throw new Error(`pure-output command touched ${what}`);
  };
  const fs = new Proxy({} as IFileSystem, {
    get: (_target, key) => refuse(`fs.${String(key)}`),
  });
  const env = new Proxy(new Map([["TZ", "UTC"]]), {
    get(target, key) {
      if (key === "get") return (name: string) => target.get(name);
      if (key === "has") return (name: string) => target.has(name);
      return refuse(`env.${String(key)}`);
    },
  });
  const ctx: RuntimeCommandContext = {
    fs,
    cwd: "/",
    env,
    stdin: unsafeBytesFromLatin1("in\n"),
    limits: resolveLimits(),
    assignShellVariable: () => refuse("assignShellVariable"),
  };
  return { ctx, touched };
}

/** Invocations the table must admit (they run clean) and must reject (they touch state). */
const SAMPLES = new Map<string, { pure: string[][]; impure: string[][] }>([
  [
    "echo",
    {
      pure: [[], ["-n"], ["-e", "a\\tb"], ["-E", "-", "--", "x"], ["hi", "f"]],
      impure: [],
    },
  ],
  [
    "printf",
    {
      pure: [["%s %d\\n", "a", "x"], ["--", "-v"], ["%(%s)T\\n", "0"], ["x"]],
      impure: [
        ["-v", "x", "hi"],
        ["-v", "a[0]", "hi"],
      ],
    },
  ],
  [
    "cat",
    {
      pure: [[], ["-"], ["-n", "-"], ["-A"], ["--number"], ["-", "-"]],
      impure: [["f"], ["-n", "f"], ["-", "f"]],
    },
  ],
]);

describe("PURE_OUTPUT_COMMANDS", () => {
  it("covers exactly the sampled implementations", () => {
    const names = [...IMPLEMENTATIONS.keys()].sort();
    expect([...PURE_OUTPUT_COMMANDS.keys()].sort()).toEqual(names);
    expect([...SAMPLES.keys()].sort()).toEqual(names);
  });

  for (const [name, accepts] of PURE_OUTPUT_COMMANDS) {
    const { pure, impure } = SAMPLES.get(name) ?? { pure: [], impure: [] };
    const implementation = IMPLEMENTATIONS.get(name) as RuntimeCommand;

    it.each(
      pure.map((args) => [args]),
    )(`${name} %j runs without touching fs or state`, async (args) => {
      expect(accepts(args, -1)).toBe(true);
      const { ctx, touched } = sealedContext();
      await implementation.execute(args, ctx);
      expect(touched).toEqual([]);
    });

    it.each(
      impure.map((args) => [args]),
    )(`${name} %j is rejected because it touches fs or state`, async (args) => {
      expect(accepts(args, -1)).toBe(false);
      const { ctx, touched } = sealedContext();
      await implementation.execute(args, ctx).catch(() => undefined);
      expect(touched).not.toEqual([]);
    });
  }

  it("rejects cat fed from a descriptor", () => {
    expect(PURE_OUTPUT_COMMANDS.get("cat")?.(["-"], 3)).toBe(false);
    expect(PURE_OUTPUT_COMMANDS.get("cat")?.(["-"], 0)).toBe(false);
  });
});
