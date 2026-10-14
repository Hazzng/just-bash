import { describe } from "vitest";
import {
  type DifferentialCase,
  itAgreesOnEveryCase,
} from "./deferral-differential.js";

const old = { f: "old\n" };

/** Later redirections, substitutions and commands that could observe the target. */
const CASES: DifferentialCase[] = [
  {
    name: "cat > f < f",
    files: old,
    script: "cat > f < f; echo rc=$?; wc -c < f",
  },
  { name: "cat - > f < f", files: old, script: "cat - > f < f; wc -c < f" },
  {
    name: "cat -- - > f < f",
    files: old,
    script: "cat -- - > f < f; wc -c < f",
  },
  { name: "cat -n > f < f", files: old, script: "cat -n > f < f; wc -c < f" },
  {
    name: "heredoc after tail reads target",
    files: old,
    script: "cat > f <<EOF\n[$(cat f)]\nEOF\ncat f",
  },
  {
    name: "heredoc before tail reads target",
    files: old,
    script: "cat <<EOF > f\n[$(cat f)]\nEOF\ncat f",
  },
  {
    name: "here-string after tail reads target",
    files: old,
    script: 'cat > f <<< "[$(cat f)]"; cat f',
  },
  {
    name: "here-string before tail reads target",
    files: old,
    script: 'cat <<< "$(cat f)" > f; cat f',
  },
  {
    name: "heredoc size of target",
    files: old,
    script: "cat > f <<EOF\nsize=$(wc -c < f)\nEOF\ncat f",
  },
  {
    name: "heredoc dash with tabs",
    files: old,
    script: "cat <<-EOF > f\n\t$(cat f)x\n\tEOF\ncat f",
  },
  {
    name: "input target expands from truncated file",
    files: old,
    script: 'echo hi > f < "$(cat f)x"; echo rc=$?; cat f',
  },
  {
    name: "dup target from file content",
    files: { f: "1\n" },
    script: "echo hi > f 2>&$(cat f); echo rc=$?; cat f",
  },
  {
    name: "process substitution reads target",
    files: old,
    script: "cat > f < <(cat f); cat f",
  },
  {
    name: "3< f <&3 after tail",
    files: old,
    script: "cat > f 3< f <&3; wc -c < f",
  },
  { name: "0<> f after tail", files: old, script: "cat > f 0<> f; wc -c < f" },
  {
    name: ">& word after tail",
    files: old,
    script: 'cat >& g > f < f; echo "[$(cat g)]"; wc -c < f',
  },
  {
    name: "arg substitution reads target",
    files: old,
    script: "echo $(cat f) > f; cat f",
  },
  {
    name: "arg substitution after target",
    files: old,
    script: "echo > f $(cat f); cat f",
  },
  {
    name: "later target reads earlier",
    files: old,
    script: "echo hi > f 2> $(cat f; echo err); cat f; cat err",
  },
  {
    name: "quoted heredoc after tail",
    script: "cat > f <<'EOF'\n$HOME `x`\nEOF\ncat f",
  },
  {
    name: "literal heredoc after tail",
    script: "cat > f <<EOF\nplain\nEOF\ncat f",
  },
  {
    name: "plain variable heredoc after tail",
    files: old,
    script: 'x=val; cat > f <<EOF\n$x ${x} "$x"\nEOF\ncat f',
  },
  {
    name: "unset variable heredoc under nounset",
    files: old,
    script: "set -u; cat > f <<EOF\n$nope\nEOF\necho rc=$?; wc -c < f",
  },
  {
    name: "nameref heredoc after tail",
    files: old,
    script:
      "a=(z); declare -n r='a[$(cat f >&2; echo 0)]'; cat > f <<EOF\n$r\nEOF\ncat f",
  },
  {
    name: "indirection heredoc after tail",
    files: old,
    script: "x=f; declare -n r=x; cat > f <<EOF\n${!x} $(cat f)\nEOF\ncat f",
  },
  {
    name: "echo with heredoc after",
    script: "echo a > f <<EOF\nz\nEOF\ncat f",
  },
  {
    name: "cat -n quoted heredoc",
    script: "cat -n > f <<'EOF'\na\nb\nEOF\ncat f",
  },
  {
    name: "heredoc substitution writes target then > truncates",
    script: "cat > f <<EOF\n$(echo seed > f; echo body)\nEOF\ncat f",
  },
  {
    name: ">> after heredoc substitution seeds file",
    script: "cat >> f <<EOF\n$(echo seed > f; echo body)\nEOF\ncat f",
  },
  {
    name: "heredoc substitution removes target dir",
    files: { "d/f": "old" },
    dirs: ["d"],
    script: "cat > d/f <<EOF\n$(rm -r d; echo body)\nEOF\necho rc=$?",
  },
  {
    name: "heredoc substitution creates target dir",
    script: "cat > d/f <<EOF\n$(mkdir d; echo body)\nEOF\necho rc=$?; cat d/f",
  },
  {
    name: "heredoc substitution replaces target with dir",
    files: old,
    script: "cat > f <<EOF\n$(rm f; mkdir f; echo body)\nEOF\necho rc=$?",
  },
  {
    name: "heredoc substitution exits non-zero",
    files: old,
    script: "cat > f <<EOF\n$(exit 3)\nEOF\necho rc=$?; cat f",
  },
  {
    name: "target substitution removes parent",
    files: { "d/f": "old" },
    dirs: ["d"],
    script: "echo hi > $(echo d/f) $(rm -r d); echo rc=$?",
  },
  {
    name: "arg substitution removes parent",
    files: { "d/f": "old" },
    dirs: ["d"],
    script: "echo hi > d/f $(rm -r d); echo rc=$?",
  },
  {
    name: "target substitution creates parent",
    script: "echo hi > $(mkdir d; echo d/f); echo rc=$?; cat d/f",
  },
  {
    name: "target becomes dir after check",
    script: "echo hi > $(echo f; mkdir f); echo rc=$?",
  },
];

describe("deferral is unobservable: redirect ordering", () => {
  itAgreesOnEveryCase(CASES);
});
