import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Bash } from "../../Bash.js";

describe("tr output construction", () => {
  it("preserves large output while translating, deleting, and squeezing", async () => {
    const input = "x".repeat(1024 * 1024);
    const env = new Bash({ files: {}, cwd: "/" });

    const translated = await env.exec("tr x y", { stdin: input });
    expect(translated.stdout).toHaveLength(input.length);
    expect(createHash("sha256").update(translated.stdout).digest("hex")).toBe(
      createHash("sha256").update("y".repeat(input.length)).digest("hex"),
    );
    expect(translated.stderr).toBe("");
    expect(translated.exitCode).toBe(0);

    const deleted = await env.exec("tr -d z", { stdin: input });
    expect(deleted.stdout).toBe(input);
    expect(deleted.stderr).toBe("");
    expect(deleted.exitCode).toBe(0);

    const squeezed = await env.exec("tr -s x y", { stdin: input });
    expect(squeezed.stdout).toBe("y");
    expect(squeezed.stderr).toBe("");
    expect(squeezed.exitCode).toBe(0);
  });
});
