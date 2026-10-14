import { describe } from "vitest";
import {
  type DifferentialCase,
  itAgreesOnEveryCase,
} from "./deferral-differential.js";

/** The open fails: the command must not have run as far as the shell can tell. */
const FAILING_OPENS: DifferentialCase[] = [
  { name: "echo > missing dir", script: 'echo hi > nodir/f; echo "rc=$?"' },
  { name: "echo >> missing dir", script: "echo hi >> nodir/f; echo rc=$?" },
  { name: "echo &> missing dir", script: "echo hi &> nodir/f; echo rc=$?" },
  { name: "&> after 2>&1", script: "echo hi 2>&1 &> nodir/f; echo rc=$?" },
  {
    name: "printf > missing dir",
    script: "printf '%d\\n' abc > nodir/f; echo rc=$?",
  },
  { name: "cat -Z > missing dir", script: "cat -Z > nodir/f; echo rc=$?" },
  { name: "cat -z - > missing dir", script: "cat -z - > nodir/f; echo rc=$?" },
  {
    name: "cat heredoc > missing dir",
    script: "cat <<EOF > nodir/f\nhi\nEOF\necho rc=$?",
  },
  {
    name: "cat > missing dir heredoc",
    script: "cat > nodir/f <<EOF\nhi\nEOF\necho rc=$?",
  },
  {
    name: "cat here-string > missing dir",
    script: "cat - <<< hi > nodir/f; echo rc=$?",
  },
  { name: ": > missing dir", script: ": > nodir/f; echo rc=$?" },
  { name: "true >> missing dir", script: "true >> nodir/f; echo rc=$?" },
  { name: "false > missing dir", script: "false > nodir/f; echo rc=$?" },
  {
    name: "ENOTDIR parent",
    files: { f: "x" },
    script: "echo hi > f/g; echo rc=$?",
  },
  { name: "output must not leak", script: "echo LEAK > nodir/f; echo rc=$?" },
  { name: "$_ after failure", script: 'echo zzz > nodir/f; echo "[$_]"' },
  { name: "$_ after success", script: 'echo zzz > f; echo "[$_]"' },
  { name: "errexit", script: "set -e; echo hi > nodir/f; echo after" },
  {
    name: "errexit in function",
    script: "set -e; f() { echo hi > nodir/f; echo in-f; }; f; echo after",
  },
  {
    name: "errexit in loop",
    script: "set -e; for i in 1 2; do echo $i > nodir/f; done; echo after",
  },
  {
    name: "ERR trap",
    script: "trap 'echo ERR $?' ERR; echo hi > nodir/f; echo after $?",
  },
  { name: "|| after failure", script: "echo hi > nodir/f || echo failed $?" },
  {
    name: "&& after failure",
    script: "echo hi > nodir/f && echo yes; echo rc=$?",
  },
  {
    name: "if / ! / while",
    script:
      "if echo hi > nodir/f; then echo T; else echo F; fi; ! echo hi > nodir/f; echo rc=$?; n=0; while echo hi > nodir/f; do n=$((n+1)); [ $n -gt 3 ] && break; done; echo n=$n",
  },
  {
    name: "PIPESTATUS",
    script: "echo hi | cat > nodir/f; echo ${PIPESTATUS[@]}",
  },
  {
    name: "pipeline tail under errexit",
    script: "set -e; printf x | cat - > nodir/f; echo after",
  },
  {
    name: "pipefail with failing upstream",
    files: { f: "old" },
    script: "set -o pipefail; false | echo hi > f; echo rc=$?; cat f",
  },
  {
    name: "command substitution status",
    script: "x=$(echo hi > nodir/f); echo rc=$? x=$x",
  },
  {
    name: "temp assignment restored",
    script: 'x=1 echo hi > nodir/f; echo "x=[$x] rc=$?"',
  },
  {
    name: "temp assignment restored after success",
    script: "X=1; X=2 echo hi > f; echo X=$X; cat f",
  },
  {
    name: "temp env visible in target",
    script: "X=t echo hi > out-$X; ls out-*; echo rc=$?",
  },
  {
    name: "printf -v must not assign",
    script: 'printf -v x hi > nodir/f; echo "rc=$? x=${x-unset}"',
  },
  {
    name: "printf -v assigns on success",
    script: 'printf -v x hi > f; echo "x=[$x]"; cat f',
  },
  { name: "xtrace", script: "set -x; echo hi > nodir/f; echo rc=$?" },
  {
    name: "xtrace 2>&1 before tail",
    script: "set -x; printf '%d' x 2>&1 > nodir/f; echo rc=$?",
  },
  {
    name: "xtrace with 2> log",
    files: { log: "" },
    script: "set -x; echo hi > nodir/f 2> log; echo rc=$?; cat log",
  },
  {
    name: "diagnostic to /dev/null",
    script: "echo hi 2>/dev/null > nodir/f; echo rc=$?",
  },
  {
    name: "diagnostic to closed fd 2",
    script: "echo hi 2>&- > nodir/f; echo rc=$?",
  },
  {
    name: "diagnostic to 2> log",
    script: "echo hi 2>log > nodir/f; echo rc=$?; cat log",
  },
  {
    name: "diagnostic to 2>&3",
    script: "exec 3> log; echo hi 2>&3 > nodir/f; echo rc=$?; cat log",
  },
  {
    name: "diagnostic via temp fd",
    script: "echo hi 3> log 2>&3 > nodir/f; echo rc=$?; cat log",
  },
  {
    name: "diagnostic via temp fd, cat file",
    files: { in: "x\n" },
    script: "cat in 3> log 2>&3 > nodir/f; echo rc=$?; cat log",
  },
  {
    name: "diagnostic under exec 2> log",
    script: "exec 2> log; echo hi > nodir/f; echo rc=$?; exec 2>&1; cat log",
  },
  {
    name: "stdout to fd 3 before failing stderr open",
    script:
      "exec 3> g; printf '%s\\n%d\\n' a x >&3 2> nodir/f; echo rc=$?; exec 3>&-; echo \"g=[$(cat g)]\"",
  },
  {
    name: "fd offset after failed open",
    files: { in: "l1\nl2\n" },
    script: "exec 3< in; cat <&3 > nodir/f; echo rc=$?; cat <&3",
  },
  {
    name: "group stdin after failed open",
    files: { in: "l1\nl2\n" },
    script: "{ cat - > nodir/f; cat; } < in",
  },
  { name: "group redirect", script: "{ echo hi; } > nodir/f; echo rc=$?" },
  { name: "exec policy", script: "exec > nodir/f; echo rc=$?" },
  {
    name: "fd var target",
    script: "echo hi {x}> nodir/f; echo rc=$? x=${x-unset}",
  },
  {
    name: ">& word after failing head",
    script: "echo hi > nodir/a >& b; echo rc=$?; ls",
  },
  {
    name: "<> after failing head",
    script: "echo hi > nodir/a 3<> b; echo rc=$?; ls",
  },
  {
    name: "<> on fd 0 after failing head",
    script: "cat > nodir/a <> b; echo rc=$?; ls",
  },
  {
    name: "subst creates dir after check",
    script: "cat > d/f <<EOF\n$(mkdir d; echo body)\nEOF\necho rc=$?; cat d/f",
  },
  {
    name: "symlink into missing dir",
    files: { f: "old" },
    script:
      "cat > f <<EOF\n$(rm f; ln -s nodir/x f; echo body)\nEOF\necho rc=$?",
  },
  {
    name: "dangling symlink target",
    script: "ln -s nodir/x link; echo hi > link; echo rc=$?",
  },
];
const STRICT = FAILING_OPENS.map((c) => ({ ...c, fs: "strict" as const }));

const LIMITS: DifferentialCase[] = [
  {
    name: "maxOutputSize exceeded, existing target",
    files: { f: "old\n" },
    limits: { maxOutputSize: 10 },
    script: "echo 0123456789abcdef > f",
  },
  {
    name: "maxOutputSize exceeded, new target",
    limits: { maxOutputSize: 10 },
    script: "echo 0123456789abcdef > f",
  },
  {
    name: "maxOutputSize exceeded, missing dir",
    fs: "strict",
    limits: { maxOutputSize: 10 },
    script: "echo 0123456789abcdef > nodir/f",
    knownDifference:
      "the command's output is charged before its open fails, so the limit error names the redirection site",
  },
  {
    name: "maxCommandCount",
    files: { f: "old" },
    limits: { maxCommandCount: 1 },
    script: "echo hi > f",
  },
  {
    name: "maxCommandCount on second command",
    files: { f: "old" },
    limits: { maxCommandCount: 1 },
    script: "true; echo hi > f",
  },
];

const READ_ONLY_OVERLAY: DifferentialCase[] = [
  { name: "echo > new file", script: "echo x > /ro/new; echo rc=$?" },
  { name: "printf > new file", script: "printf '%d' z > /ro/new2; echo rc=$?" },
  { name: "true > new file", script: "true > /ro/new3; echo rc=$?" },
  { name: "echo >> new file", script: "echo x >> /ro/new4; echo rc=$?" },
  {
    name: "cat heredoc > new file",
    script: "cat > /ro/new5 <<EOF\nx\nEOF\necho rc=$?",
  },
];
const READ_ONLY = READ_ONLY_OVERLAY.map((c) => ({ ...c, fs: "ro" as const }));

describe("deferral is unobservable: failed opens", () => {
  itAgreesOnEveryCase([...STRICT, ...LIMITS, ...READ_ONLY]);
});
