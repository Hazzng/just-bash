import { afterEach, beforeEach, describe, it } from "vitest";
import {
  cleanupTestDir,
  compareOutputs,
  createTestDir,
  setupFiles,
} from "./fixture-runner.js";

const printTargets =
  '; echo "rc=$?"; echo "[e]"; cat "$top/e" 2>/dev/null; echo "[d/e]"; cat "$top/d/e" 2>/dev/null; [ "$PWD" = "$top/d" ] && echo "pwd=d" || echo "pwd=top"';

describe("compound command redirect cwd - Real Bash Comparison", () => {
  let testDirectory: string;

  beforeEach(async () => {
    testDirectory = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDirectory);
  });

  const cases: [string, string][] = [
    ["subshell", "( cd d && echo out ) > e"],
    ["brace group", "{ cd d && echo out; } > e"],
    ["function call", "f() { cd d && echo out; }; f > e"],
    ["function definition", "f() { cd d && echo out; } > e; f"],
    ["for loop", "for x in out; do cd d && echo $x; done > e"],
    ["append", "echo pre > e; ( cd d && echo out ) >> e"],
    ["stderr", "( cd d && echo err >&2 ) 2> e"],
    ["both streams", "( cd d && echo out; echo err >&2 ) &> e"],
    [
      "noclobber with an existing inner file",
      "set -o noclobber; echo pre > d/e; ( cd d && echo out ) > e",
    ],
    [
      "existing inner file is untouched",
      "echo pre > e; echo pre2 > d/e; ( cd d && echo out ) > e",
    ],
    [
      "relative subdirectory target",
      "mkdir sub; ( cd d && echo out ) > sub/e; cat sub/e",
    ],
  ];

  for (const [name, script] of cases) {
    it(name, async () => {
      const env = await setupFiles(testDirectory, { "d/.keep": "" });
      await compareOutputs(
        env,
        testDirectory,
        `top=$PWD; ${script}${printTargets}`,
      );
    });
  }
});
