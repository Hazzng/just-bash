---
"just-bash": patch
---

perf(python3): ~2× faster startup by caching WASM compilation and deferring setup imports.

The ~5.7MB CPython WASM module is now compiled once per process and the compiled `WebAssembly.Module` is shared with every worker via `instantiateWasm`, instead of being recompiled in each fresh worker. This removes the dominant per-call cost and lets V8 tier up the shared module, so the Python execution itself also gets faster on subsequent calls. Each execution still runs in its own fresh worker — isolation is unchanged. If the binary can't be read or compiled, workers transparently fall back to compiling normally.

The per-call Python setup was also slimmed: `json`/`base64` are imported lazily only when an HTTP request is made, and path redirection for `glob`/`shutil`/`pathlib` is deferred until user code actually imports those modules (they pull in `re`/`fnmatch`, previously imported on every call). Scripts that don't touch those modules no longer pay their import cost. Redirection semantics are identical; both `import` and `importlib.import_module` are hooked so neither can bypass it.
