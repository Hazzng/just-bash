import { describe, expect, it } from "vitest";
import { Bash } from "../Bash.js";

// Expected values were taken from bash 5.1 with stdout and stderr on pipes.
const group = "{ echo out; echo err >&2; }";

const cases: [string, string, string, number][] = [
  [`${group} > /dev/stderr 2>/dev/null; echo after`, "after\n", "out\n", 0],
  [`${group} >> /dev/stderr 2>/dev/null; echo after`, "after\n", "out\n", 0],
  [`${group} 2> /dev/stdout > f; echo [; cat f`, "err\n[\nout\n", "", 0],
  [`${group} > f 2>> /dev/stdout; echo [; cat f`, "[\nout\nerr\n", "", 0],
  [`${group} 2>&- > /dev/stderr; echo rc=$?`, "rc=1\n", "", 0],
  ["exec 2>/dev/null; exec > /dev/stderr; echo hidden; echo x >&2", "", "", 0],
  [`${group} 1>&2 2>/dev/null`, "", "out\n", 0],
  [`${group} 2>/dev/null > /dev/stderr; echo after`, "after\n", "", 0],
  ["echo x > a > /dev/stdout; echo rc=$?; cat a", "rc=0\nx\n", "", 0],
];

describe("/dev/stdout and /dev/stderr follow the fd as of that redirect", () => {
  it.each(cases)("%s", async (script, stdout, stderr, exitCode) => {
    const result = await new Bash().exec(script);
    expect(result).toMatchObject({ stdout, stderr, exitCode });
  });
});
