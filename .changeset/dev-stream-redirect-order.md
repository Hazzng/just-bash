---
"just-bash": patch
---

Open `/dev/stdout` and `/dev/stderr` redirect targets against the fd as it is at that redirect

A redirect to `/dev/stdout` or `/dev/stderr` now duplicates fd 1 or fd 2 as it points at that point in the redirect list, like `>&1` and `>&2`. Before, it used where the fd pointed after the whole list, so `cmd > /dev/stderr 2>/dev/null` lost the output, `cmd 2> /dev/stdout > f` sent stderr into `f`, and `exec 2>e; exec &> /dev/stderr` sent later output to the caller instead of `e`.
