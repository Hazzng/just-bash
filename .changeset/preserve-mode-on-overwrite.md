---
"just-bash": patch
---

Keep a file's mode when it is overwritten on `InMemoryFs` and `OverlayFs`

`echo x > script.sh` and `sed -i` reset an existing file to `0644`, so an executable script stopped running and the next `./script.sh` exited 126. On `OverlayFs`, the first `>` or `>>` to an executable from the real directory also dropped its exec bit. An overwrite now keeps the file's mode, as `open(O_TRUNC)` does in bash. An explicit `mode` passed to `writeFileSync` or `writeFileLazy` still wins. A new file, or one written over a directory, a symlink, or a removed path, still gets `0644`. `ReadWriteFs` already kept the mode. Set-user-ID, set-group-ID, and sticky bits carry over unchanged, as they already did for `>>` on `InMemoryFs`.
