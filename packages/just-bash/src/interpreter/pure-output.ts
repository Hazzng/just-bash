/**
 * Pure-output commands: bundled `echo`, `printf` and `cat` fed only by stdin.
 * Their result is a function of their arguments and stdin, so running them
 * before their output file is opened is unobservable, which lets the open
 * become the delivery write (`echo r > f` is one backend write). Everything
 * here is a closed table plus one AST predicate; nothing is registered on
 * commands and nothing runs user code.
 */
import type { RedirectionNode, WordNode } from "../ast/types.js";
import type { Command } from "../types.js";
import {
  type ResolveCommandResult,
  resolveCommand,
} from "./command-resolution.js";
import type { InterpreterContext } from "./types.js";

export type PureOutputPredicate = (
  args: readonly string[],
  stdinSourceFd: number,
) => boolean;

const SHORT_OR_LONG_OPTION = /^-(?:[A-Za-z]+|-[a-z][a-z-]*)$/;

/**
 * Bundled commands that touch neither the filesystem nor shell state for the
 * invocations the predicate accepts. `pure-output.test.ts` runs every entry
 * under a filesystem and environment that throw on any access.
 */
export const PURE_OUTPUT_COMMANDS: ReadonlyMap<string, PureOutputPredicate> =
  new Map([
    ["echo", () => true],
    // printf -v assigns a shell variable, which a failed open must not leave behind.
    ["printf", (args) => !args[0]?.startsWith("-") || args[0] === "--"],
    // cat reads files for every operand that is not `-`, and a descriptor
    // feeding fd 0 is consumed by the run.
    [
      "cat",
      (args, stdinSourceFd) =>
        stdinSourceFd === -1 &&
        args.every((arg) => arg === "-" || SHORT_OR_LONG_OPTION.test(arg)),
    ],
  ]);

const OUTPUT_OPERATORS = new Set(["&>", "&>>", ">", ">>", ">|"]);

const PLAIN_PARAMETER = /^(?:[A-Za-z_]\w*|\d+|[?#$!*@_-])$/;

/**
 * True when expanding the word can neither run code, assign, glob nor read a
 * file. Positive allowlist: a plain `$name` is admitted, a nameref is not
 * because it can point at `a[$(...)]`.
 */
function isInertWord(
  word: Pick<WordNode, "parts">,
  namerefs: ReadonlySet<string>,
): boolean {
  return word.parts.every((part) => {
    switch (part.type) {
      case "Literal":
      case "SingleQuoted":
      case "Escaped":
      case "TildeExpansion":
        return true;
      case "DoubleQuoted":
        return isInertWord(part, namerefs);
      case "ParameterExpansion":
        return (
          part.operation === null &&
          PLAIN_PARAMETER.test(part.parameter) &&
          !namerefs.has(part.parameter)
        );
      default:
        return false;
    }
  });
}

const isInertStdinRedirect = (
  r: RedirectionNode,
  namerefs: ReadonlySet<string>,
): boolean =>
  (r.fd === null || r.fd === 0) &&
  r.fdVariable === undefined &&
  (r.target.type === "HereDoc"
    ? isInertWord(r.target.content, namerefs)
    : r.operator === "<<<" && isInertWord(r.target, namerefs));

/**
 * Index of the redirection whose open may wait until delivery, or -1. It is
 * the last file output for fd 1 (`>`, `>|`, `>>`, `&>`, `&>>`), and nothing
 * after it may touch the filesystem or run user code, so no later
 * redirection can observe the target before it is opened.
 */
export function findDeferrableTail(
  redirections: readonly RedirectionNode[],
  namerefs: ReadonlySet<string>,
): number {
  let tail = redirections.length - 1;
  while (tail >= 0 && isInertStdinRedirect(redirections[tail], namerefs)) {
    tail--;
  }
  if (tail < 0) return -1;
  const r = redirections[tail];
  return OUTPUT_OPERATORS.has(r.operator) &&
    r.target.type !== "HereDoc" &&
    r.fdVariable === undefined &&
    (r.fd === null || r.fd === 1)
    ? tail
    : -1;
}

export type PinnedResolution = Extract<ResolveCommandResult, { cmd: Command }>;

/**
 * Resolve the command once, after every redirect target has expanded, and
 * return the resolution to execute when the invocation is pure: a bundled
 * table entry whose arguments the entry accepts, with no function of that
 * name and xtrace off (PS4 can run user code). Null means "not pure"; the
 * caller opens eagerly and dispatches as usual.
 */
export async function pinPureOutput(
  ctx: InterpreterContext,
  name: string,
  args: readonly string[],
  stdinSourceFd: number,
): Promise<PinnedResolution | null> {
  const accepts = PURE_OUTPUT_COMMANDS.get(name);
  if (
    !accepts ||
    ctx.state.options.xtrace ||
    ctx.state.functions.has(name) ||
    !accepts(args, stdinSourceFd)
  ) {
    return null;
  }
  const resolved = await resolveCommand(ctx, name);
  return resolved !== null &&
    "cmd" in resolved &&
    resolved.cmd.internalIsExtension === false
    ? resolved
    : null;
}
