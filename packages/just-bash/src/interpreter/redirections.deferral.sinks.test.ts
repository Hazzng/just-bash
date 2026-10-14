import { describe } from "vitest";
import {
  type DifferentialCase,
  itAgreesOnEveryCase,
} from "./deferral-differential.js";

const old = { f: "old\n" };

/** Sinks, prepare failures after the tail, devices, symlinks and compound forms. */
const CASES: DifferentialCase[] = [
  {
    name: "two outputs",
    files: { a: "old", b: "old" },
    script: 'echo hi > a > b; echo "a=[$(cat a)] b=[$(cat b)]"',
  },
  {
    name: "stdout and stderr to same file",
    script: "printf '%d\\n' 1 x > f 2>&1; cat f",
  },
  { name: "stderr only to file", script: "printf '%d\\n' x 2> f; echo; cat f" },
  {
    name: "stderr then stdout to stderr",
    script: "printf '%d\\n' 1 x 2> f >&2; cat f",
  },
  {
    name: "stdout moved away later",
    files: old,
    script: "echo hi > f 1>&2; wc -c < f",
  },
  {
    name: "2>&1 before tail",
    files: old,
    script: "printf '%d\\n' 1 x 2>&1 > f; cat f",
  },
  {
    name: "head dup then tail",
    script:
      'exec 3> g; echo hi >&3 > f; exec 3>&-; echo "g=[$(cat g)] f=[$(cat f)]"',
  },
  {
    name: "&> and &>>",
    script: "echo a &> f; echo b &>> f; cat f; printf '%d' x &> g; cat g",
  },
  { name: "&> stderr and stdout", script: "printf '%d\\n' 1 x &> f; cat f" },
  {
    name: "> f 2> f ordering",
    files: old,
    script: "echo out > f 2> f; echo rc=$?; cat f",
  },
  {
    name: "later < missing fails prepare",
    files: old,
    script: "echo hi > f < missing; echo rc=$?; cat f",
  },
  {
    name: "later bad dup fails prepare",
    files: old,
    script: "echo hi > f 2>&9; echo rc=$?; cat f",
  },
  {
    name: "> f >> g < missing",
    files: old,
    script: "echo hi > f >> g < missing; echo rc=$?; cat f; cat g",
  },
  {
    name: "> f < missing under errexit",
    files: old,
    script: "set -e; echo hi > f < missing; echo after",
  },
  {
    name: ": > f < missing",
    files: old,
    script: ": > f < missing; echo rc=$?; wc -c < f",
  },
  {
    name: ">> g then < missing",
    script: "echo hi >> g < missing; echo rc=$?; ls g",
  },
  {
    name: "fd var then < missing",
    files: old,
    script: "echo hi {x}> f < missing; echo rc=$?; cat f",
  },
  {
    name: "fd var redirect",
    script: "echo hi {fd}>f; echo rc=$? fd=$fd; echo there >&$fd; cat f",
  },
  {
    name: "empty output truncates and appends",
    files: old,
    script: "echo -n > f; wc -c < f; printf '' >> f; wc -c < f",
  },
  {
    name: "utf8 and bytes",
    script:
      "echo 'héllo ✓' > f; wc -c < f; printf '\\xff\\x00a' > g; wc -c < g",
  },
  {
    name: "cat with file operand",
    files: { in: "data\n", f: "old\n" },
    script: "cat in > g; cat g; cat f > f; wc -c < f",
  },
  {
    name: "cat from pipe",
    files: old,
    script: "cat f | cat > f; cat f; printf x | cat - > g; cat g",
  },
  {
    name: "pipeline tail",
    script: "echo hi | cat > f; cat f; echo a | echo b > g; cat g",
  },
  {
    name: "loop append",
    script: "for i in 1 2 3; do echo $i >> f; done; cat f",
  },
  {
    name: "group and subshell",
    script: "( echo a ) > f; { echo b; } >> f; cat f",
  },
  {
    name: "break with redirect",
    script:
      "for i in 1; do echo x > f; break; done; cat f; for i in 1 2; do break > g; done; ls g",
  },
  {
    name: "deferred then read in same list",
    files: old,
    script: "echo hi > f && cat f",
  },
  {
    name: "target with expansion",
    script: "n=out; echo hi > ${n}_1; cat out_1; echo x > $(echo o2); cat o2",
  },
  { name: "ambiguous target", script: "echo hi > $nothing; echo rc=$?" },
  {
    name: "/dev/stdout and /dev/stderr targets",
    script:
      "true > /dev/stdout; echo hi > /dev/stdout; echo e > /dev/stderr; echo rc=$?",
  },
  {
    name: "/dev/null and /dev/full",
    script: "echo hi > /dev/null; echo rc=$?; echo hi > /dev/full; echo rc=$?",
  },
  {
    name: "symlink target",
    files: { real: "old" },
    script: "ln -s real link; echo hi > link; cat real",
  },
  {
    name: "dangling symlink target",
    script:
      "ln -s missing link; echo hi > link; echo rc=$?; cat missing; echo hi >> link2; echo rc=$?",
  },
  {
    name: "symlink to directory",
    script: "mkdir d; ln -s d link; echo hi > link; echo rc=$?",
  },
  {
    name: "directory target",
    dirs: ["d"],
    script: "echo hi > d; echo rc=$?; echo hi >> d; echo rc=$?",
  },
  {
    name: "file as parent",
    files: { x: "" },
    script: "echo hi > x/f; echo rc=$?; echo hi >> x/f; echo rc=$?",
  },
];

describe("deferral is unobservable: sinks and targets", () => {
  itAgreesOnEveryCase(CASES);
});
