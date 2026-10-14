---
"just-bash": patch
---

Resolve a compound command's redirect target once, before its body runs

`( cd d && echo out ) > e` left `./e` empty and wrote `out` to `d/e`, because the target was resolved again after the body changed directory. The same happened for `{ }` groups, functions, and `while`, `until`, `for`, `if`, and `case` with `>`, `>|`, `>>`, `2>`, `&>`, or `&>>`. The output now goes to the file opened before the body, as in bash, and `set -o noclobber` is no longer bypassed for it.
