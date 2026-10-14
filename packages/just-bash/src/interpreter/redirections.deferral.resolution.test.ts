import { describe } from "vitest";
import {
  type DifferentialCase,
  itAgreesOnEveryCase,
} from "./deferral-differential.js";

const old = { f: "old\n" };

/** What the command resolves to, and shell state that can change before it runs. */
const CASES: DifferentialCase[] = [
  {
    name: "function named echo",
    script: "echo(){ printf 'fn:%s\\n' \"$*\"; }; echo hi > f; cat f",
  },
  {
    name: "function reads target",
    files: old,
    script: "echo() { cat f; printf FUNC; }; echo hi > f; cat f",
  },
  {
    name: "function defined in target substitution",
    script: 'echo hi > "$(echo(){ printf FN; }; printf f)"; cat f',
  },
  {
    name: "function defined in target substitution reads target",
    files: old,
    script: 'echo hi > "$(echo(){ command cat f; }; printf f)"; cat f',
  },
  {
    name: "function defined in heredoc substitution",
    script:
      "cat <<EOF > out1\n$(cat() { printf FUNC; }; echo body)\nEOF\necho rc=$?; cat out1",
  },
  {
    name: "PATH cleared in target substitution",
    script: "echo hi > $(PATH=/nonexistent; printf out1); echo rc=$?; cat out1",
  },
  {
    name: "PATH changed by arithmetic in target",
    script:
      'cat - > "$((PATH=1))f" <<< x; echo rc=$?; PATH=/usr/bin:/bin; cat 1f',
  },
  {
    name: "hash -p in target substitution",
    files: { myecho: "#!/bin/bash\nprintf SCRIPT\n" },
    script:
      'chmod +x myecho; echo hi > $(hash -p "$PWD/myecho" echo; printf out1); cat out1; echo',
  },
  {
    name: "PATH script shadows echo",
    files: { "bin/echo": "#!/bin/bash\nprintf SCRIPT; printf x > side\n" },
    dirs: ["bin"],
    script:
      "chmod +x bin/echo; PATH=$PWD/bin:$PATH; echo hi > out1; cat out1; echo; cat side",
  },
  {
    name: "relative PATH entry shadows echo",
    files: { "bin/echo": "#!/bin/bash\nprintf SCRIPT\n" },
    dirs: ["bin"],
    script:
      "chmod +x bin/echo; PATH=bin:$PATH; echo hi > out1; cat out1; echo; cd bin; echo hi > ../out2; cat ../out2; echo",
  },
  {
    name: "variable command name",
    files: old,
    script: "c=cat; $c > f < f; wc -c < f; c=echo; $c hi > g; cat g",
  },
  {
    name: "command echo",
    script: "command echo hi > f; cat f; command -p echo hi > g; cat g",
  },
  { name: "builtin echo", files: old, script: "builtin echo hi > f; cat f" },
  {
    name: "alias to echo",
    files: old,
    script: "shopt -s expand_aliases; alias e='echo'; e hi > f; cat f",
  },
  { name: "prefix assignment", script: "X=1 echo hi > f; cat f" },
  {
    name: "host command shadows echo",
    files: old,
    shadow: "echo",
    script: "echo hi > f; cat f",
  },
  {
    name: "host command shadows cat",
    files: old,
    shadow: "cat",
    script: "cat - > f <<< x; command cat f",
  },
  {
    name: "host command shadows printf",
    files: old,
    shadow: "printf",
    script: "printf x > f; cat f",
  },
  {
    name: "exec args on printf",
    execArgs: ["-v", "x", "hi"],
    script: "printf > f; echo rc=$? x=${x-unset}; cat f",
  },
  {
    name: "exec args on cat",
    files: old,
    execArgs: ["f"],
    script: "cat > f; echo rc=$?; wc -c < f",
  },
  {
    name: "noclobber",
    files: old,
    script:
      "set -C; echo hi > f; echo rc=$?; cat f; echo hi >| f; echo rc=$?; echo n > g; echo rc=$?; cat f g",
  },
  {
    name: "noclobber append",
    files: old,
    script: "set -C; echo hi >> f; cat f",
  },
  {
    name: "noclobber same target twice",
    script: "set -C; echo hi > a > a; echo rc=$?; ls",
  },
  {
    name: "noclobber set inside target substitution",
    files: old,
    script: "echo hi > $(set -C; echo f); echo rc=$?; cat f",
  },
  {
    name: "noclobber file appears via arg substitution",
    script: "set -o noclobber; echo $(echo x > f) > f; echo rc=$?; cat f",
  },
  {
    name: "noclobber heredoc substitution creates target",
    script:
      "set -o noclobber; cat > f <<EOF\n$(echo PRECIOUS > f; echo body)\nEOF\necho rc=$?; cat f",
  },
  {
    name: "noclobber stdin substitution creates target",
    script:
      "set -o noclobber; echo body > f < $(echo PRECIOUS > f; echo /dev/null); echo rc=$?; cat f",
  },
  {
    name: "PS4 reads target",
    files: old,
    script: "PS4='[$(cat f)]+ '; set -x; echo hi > f; set +x; cat f",
  },
  {
    name: "xtrace set inside target substitution",
    files: old,
    script:
      "PS4='[$(cat f)]+ '; echo hi > \"$(set -x; echo f)\"; set +x; cat f",
  },
  {
    name: "function defined by PS4",
    files: old,
    script:
      "PS4='$(echo(){ printf FN; })+ '; set -x; echo hi > f; set +x; cat f",
  },
  {
    name: "xtrace success with 2>&1",
    files: old,
    script: "set -x; echo hi > f 2>&1; cat f",
  },
  {
    name: "xtrace with 2> file",
    files: old,
    script: "set -x; echo hi 2> f; cat f",
  },
  {
    name: "return and exit with redirect",
    script: "g(){ return 4 > f; }; g; echo rc=$?; (exit 3 > g); echo rc=$?; ls",
  },
  {
    name: "function returning after redirect",
    files: old,
    script: "g() { echo hi > f; return 7; }; g; echo rc=$?; cat f",
  },
  {
    name: "cat --bogus",
    files: old,
    script: "cat --bogus > f 2>/dev/null; echo rc=$?; wc -c < f",
  },
  {
    name: "cat -- f and cat -n f",
    files: old,
    script: "cat -- f > f; echo rc=$?; cat -n f > f; echo rc=$?",
  },
  { name: "printf -- -v", script: "printf -- '%s\\n' -v > f; cat f" },
];

describe("deferral is unobservable: command resolution and shell state", () => {
  itAgreesOnEveryCase(CASES);
});
