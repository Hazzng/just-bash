---
"just-bash": patch
---

Repeated `grep -e` options overwrote the earlier patterns, so only the last one was used. All `-e` patterns now combine.
