---
"just-bash": patch
---

Fix `js-exec` Buffer encoding defaults, character-boundary writes, and range validation. Reduce temporary allocations in byte conversion, `tr`, and `sed` while preserving execution limits.
