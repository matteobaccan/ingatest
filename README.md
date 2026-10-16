# Inga in the browser — beta

**Open it: <https://matteobaccan.github.io/ingatest/>**

Inga, a local LLM inference engine, compiled to WebAssembly: a GGUF model runs in a
browser tab, on the device's CPU or on its GPU through WebGPU, with nothing installed
and nothing sent anywhere (the model is downloaded to the browser's private storage
and runs there).

Built from a private repository; this repository holds only the built page, published
automatically at every change.

## How to report

1. Load a model (a small one first, SmolLM2-135M), ask something, press **Standard
   test** (and, on the GPU, **GPU benchmark**).
2. Press **Report on GitHub** at the bottom of the page: it opens an issue here with the
   browser, the GPU, the model, the speeds and the log filled in. Say what you did and
   what went wrong, then submit it (a GitHub account is needed).
3. Without a GitHub account, **Copy report** and send the text to the maintainer.

Read the report before submitting it: it becomes a public issue (it lists the browser,
the GPU adapter, the model's file name and the speeds; nothing else).
