---
"just-bash": patch
---

Reduce temporary string allocation for large file processing by building byte conversions, `tr` output, and `sed` global substitution output in bounded chunks. Preserve binary encoding and command semantics while reducing memory pressure.
