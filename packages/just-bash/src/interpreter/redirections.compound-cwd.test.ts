import { describe, expect, it } from "vitest";
import { Bash } from "../Bash.js";

const OUTER = "/home/user/e";
const INNER = "/home/user/d/e";

type Snapshot = {
  stdout: string;
  stderr: string;
  exitCode: number;
  outer: string | null;
  inner: string | null;
};

const read = async (env: Bash, path: string): Promise<string | null> =>
  (await env.fs.exists(path)) ? await env.fs.readFile(path) : null;

async function runBesideDirD(script: string): Promise<Snapshot> {
  const env = new Bash();
  const { stdout, stderr, exitCode } = await env.exec(`mkdir d; ${script}`);
  return {
    stdout,
    stderr,
    exitCode,
    outer: await read(env, OUTER),
    inner: await read(env, INNER),
  };
}

const ok = (stdout: string, outer: string | null): Snapshot => ({
  stdout,
  stderr: "",
  exitCode: 0,
  outer,
  inner: null,
});

describe("compound command redirects resolve against the cwd before the body", () => {
  it("subshell: ( cd d && echo out ) > e", async () => {
    expect(await runBesideDirD("( cd d && echo out ) > e; pwd")).toEqual(
      ok("/home/user\n", "out\n"),
    );
  });

  it("brace group keeps the inner cd but still writes the outer file", async () => {
    expect(await runBesideDirD("{ cd d && echo out; } > e; pwd")).toEqual(
      ok("/home/user/d\n", "out\n"),
    );
  });

  it("function call: f > e", async () => {
    expect(
      await runBesideDirD("f() { cd d && echo out; }; f > e; pwd"),
    ).toEqual(ok("/home/user/d\n", "out\n"));
  });

  it("function definition: f() { ...; } > e", async () => {
    expect(
      await runBesideDirD("f() { cd d && echo out; } > e; f; pwd"),
    ).toEqual(ok("/home/user/d\n", "out\n"));
  });

  it("while loop", async () => {
    expect(
      await runBesideDirD(
        "i=0; while [ $i -lt 1 ]; do i=1; cd d && echo out; done > e",
      ),
    ).toEqual(ok("", "out\n"));
  });

  it("for loop", async () => {
    expect(
      await runBesideDirD("for x in out; do cd d && echo $x; done > e"),
    ).toEqual(ok("", "out\n"));
  });

  it("if and case", async () => {
    expect(await runBesideDirD("if cd d; then echo out; fi > e")).toEqual(
      ok("", "out\n"),
    );
    expect(
      await runBesideDirD("case x in x) cd d && echo out;; esac > e"),
    ).toEqual(ok("", "out\n"));
  });

  it("nested subshell inherits the outer cd but the redirect does not", async () => {
    expect(await runBesideDirD("( cd d; ( echo out ) ) > e")).toEqual(
      ok("", "out\n"),
    );
  });

  it(">> appends to the outer file", async () => {
    expect(
      await runBesideDirD("echo pre > e; ( cd d && echo out ) >> e"),
    ).toEqual(ok("", "pre\nout\n"));
  });

  it("2> sends stderr to the outer file", async () => {
    expect(await runBesideDirD("( cd d && echo err >&2 ) 2> e")).toEqual(
      ok("", "err\n"),
    );
  });

  it("&> and &>> send both streams to the outer file", async () => {
    expect(
      await runBesideDirD("( cd d && echo out; echo err >&2 ) &> e"),
    ).toEqual(ok("", "out\nerr\n"));
    expect(
      await runBesideDirD("echo pre > e; ( cd d && echo out ) &>> e"),
    ).toEqual(ok("", "pre\nout\n"));
  });

  it("here-string input alongside the output redirect", async () => {
    expect(await runBesideDirD("( cd d && cat ) <<< hi > e")).toEqual(
      ok("", "hi\n"),
    );
  });

  it("noclobber: >| overwrites the outer file", async () => {
    expect(
      await runBesideDirD(
        "set -o noclobber; echo pre > e; ( cd d && echo out ) >| e",
      ),
    ).toEqual(ok("", "out\n"));
  });

  it("noclobber: an existing inner file does not block the outer write", async () => {
    expect(
      await runBesideDirD(
        "set -o noclobber; echo pre > d/e; ( cd d && echo out ) > e",
      ),
    ).toEqual({ ...ok("", "out\n"), inner: "pre\n" });
  });

  it("noclobber: an existing outer file fails before the body runs", async () => {
    expect(
      await runBesideDirD(
        "set -o noclobber; echo pre > e; ( cd d && echo out ) > e",
      ),
    ).toEqual({
      stdout: "",
      stderr: "bash: e: cannot overwrite existing file\n",
      exitCode: 1,
      outer: "pre\n",
      inner: null,
    });
  });

  it("a same-named inner file is left untouched", async () => {
    expect(
      await runBesideDirD(
        "echo pre > e; echo pre2 > d/e; ( cd d && echo out ) > e",
      ),
    ).toEqual({ ...ok("", "out\n"), inner: "pre2\n" });
  });

  it("a relative subdirectory target resolves in the outer cwd", async () => {
    const env = new Bash();
    const { stdout, stderr, exitCode } = await env.exec(
      "mkdir d sub; ( cd d && echo out ) > sub/e",
    );
    expect({ stdout, stderr, exitCode }).toEqual({
      stdout: "",
      stderr: "",
      exitCode: 0,
    });
    expect(await read(env, "/home/user/sub/e")).toBe("out\n");
    expect(await env.fs.exists("/home/user/d/sub")).toBe(false);
  });

  it("cd into /dev does not turn a file target into a device", async () => {
    expect(await runBesideDirD("( cd /dev && echo out ) > e")).toEqual(
      ok("", "out\n"),
    );
  });
});
