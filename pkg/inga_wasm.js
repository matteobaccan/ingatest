/**
 * A WebGPU device (`await Gpu.create()`).
 */
export class Gpu {
    static __wrap(ptr) {
        const obj = Object.create(Gpu.prototype);
        obj.__wbg_ptr = ptr;
        GpuFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        GpuFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_gpu_free(ptr, 0);
    }
    /**
     * The browser's WebGPU adapter, with the largest limits it has.
     * @returns {Promise<Gpu>}
     */
    static create() {
        const ret = wasm.gpu_create();
        return ret;
    }
    /**
     * Destroys the device (`GPUDevice.destroy`): its memory goes back now. The worker
     * does it when a model will not run on the GPU, before it loads it on the CPU;
     * the `Gpu` must not be used after.
     */
    destroy() {
        wasm.gpu_destroy(this.__wbg_ptr);
    }
    /**
     * The adapter, its limits and the bytes uploaded, as JSON: `name`, `line` (one
     * line for the page), `max_buffer_size`, `max_storage_binding`,
     * `max_workgroup_storage`, `shader_f16`, `subgroups` (the device has them),
     * `subgroup_sizes` (the adapter's min and max, 0 when not told), `subgroups_text`,
     * `subgroup_kernels` (those that run with `sg=on`: "sg", "sgx" or "none"),
     * `timestamp_query`, `tuning`, `kernels` (those compiled so far),
     * `weight_bytes`, `other_bytes`, the pacing (`submit_limit`: the most dispatches
     * in one submission; `prompt_chunk`: the prompts' largest chunk asked, null for
     * the default; `Gpu::tune`'s `submit=` and `chunk=`) and what it gave so far
     * (`submits`, `most_dispatches`: the most one submission carried).
     * @returns {string}
     */
    info() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.gpu_info(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * The submissions whose timestamps are not read back yet.
     * @returns {number}
     */
    profileInFlight() {
        const ret = wasm.gpu_profileInFlight(this.__wbg_ptr);
        return ret >>> 0;
    }
    /**
     * Starts the kernel times (`WebGpu::start_profiling`): `mode` "auto",
     * "timestamps", "fences" or "off"; resolves to the mode used. Between answers'
     * steps only.
     * @param {string} mode
     * @returns {Promise<any>}
     */
    profileStart(mode) {
        const ptr0 = passStringToWasm0(mode, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.gpu_profileStart(this.__wbg_ptr, ptr0, len0);
        return ret;
    }
    /**
     * The kernel times so far, as JSON: `mode`, `overhead_ms` (the round trip taken
     * off each dispatch with fences), `steps` (the steps timed), `rows` (`label`, `kernel`, `calls`, `ms`,
     * `bytes`: weights read), the longest first.
     * @returns {string}
     */
    profile() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.gpu_profile(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Applies the GPU switches of `spec` (comma-separated, `WebGpu::tune`): `head`,
     * `qonce`, `reuse`, `sampling` turn off an optimization (the output layer in the
     * layers' pass, the inputs quantized once, the bind groups reused, the tokens drawn
     * on the GPU), for the next load: the baseline of a measurement
     * (`tests/browser.cjs bench-gpu ... off=...`); `f16=on|off`, `rows=8|4`,
     * `tiles=64|32`, `slab=64|128` and `preset=default|apple` choose the kernels from
     * the next step on (the page's GPU benchmark; Apple's preset from the adapter's
     * vendor); `submit=N` (dispatches per submission, from the next one) and
     * `chunk=N` (the prompts' largest chunk, for the next load) pace a mobile GPU.
     *
     * # Errors
     * An unknown switch or value.
     * @param {string} spec
     */
    tune(spec) {
        const ptr0 = passStringToWasm0(spec, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.gpu_tune(this.__wbg_ptr, ptr0, len0);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * The kernels chosen ([`Gpu::tune`]), as its switches:
     * `f16=on,rows=8,tiles=64,slab=64`.
     * @returns {string}
     */
    tuning() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.gpu_tuning(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
}
if (Symbol.dispose) Gpu.prototype[Symbol.dispose] = Gpu.prototype.free;

/**
 * A GGUF model being received in chunks (`Uint8Array`s, in file order): each byte is
 * copied once, from the chunk straight into its tensor's buffer.
 */
export class Loader {
    static __wrap(ptr) {
        const obj = Object.create(Loader.prototype);
        obj.__wbg_ptr = ptr;
        LoaderFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        LoaderFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_loader_free(ptr, 0);
    }
    /**
     * The model, once every chunk has been pushed: `name` is its file name, `ctx` the
     * context size of its conversation (0: 2048), `kv` how its KV cache stores keys
     * and values on the CPU (`f16`, `q8_0`, `q4_0`; none: f16; the GPU's in f16).
     * @param {string} name
     * @param {number} ctx
     * @param {string | null} [kv]
     * @returns {Model}
     */
    finish(name, ctx, kv) {
        const val3 = +ctx;
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = isLikeNone(kv) ? 0 : passStringToWasm0(kv, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.loader_finish(this.__wbg_ptr, ptr0, len0, val3, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Model.__wrap(ret[0]);
    }
    constructor() {
        const ret = wasm.loader_new();
        this.__wbg_ptr = ret;
        LoaderFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Takes the next chunk of the file.
     * @param {Uint8Array} chunk
     */
    push(chunk) {
        const ret = wasm.loader_push(this.__wbg_ptr, chunk);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Bytes received so far.
     * @returns {number}
     */
    received() {
        const ret = wasm.loader_received(this.__wbg_ptr);
        return ret;
    }
    /**
     * A loader that sends the layers' and the output layer's weights to `gpu` as
     * their bytes arrive (they never stay in WebAssembly memory), and runs the layers
     * there.
     * @param {Gpu} gpu
     * @returns {Loader}
     */
    static withGpu(gpu) {
        _assertClass(gpu, Gpu);
        const ret = wasm.loader_withGpu(gpu.__wbg_ptr);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return Loader.__wrap(ret[0]);
    }
}
if (Symbol.dispose) Loader.prototype[Symbol.dispose] = Loader.prototype.free;

/**
 * A loaded model and one conversation on it.
 */
export class Model {
    static __wrap(ptr) {
        const obj = Object.create(Model.prototype);
        obj.__wbg_ptr = ptr;
        ModelFinalization.register(obj, obj.__wbg_ptr, obj);
        return obj;
    }
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        ModelFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_model_free(ptr, 0);
    }
    /**
     * Starts the answer to a chat (as [`Model::chat`]), generated a token at a time by
     * [`Model::step`].
     * @param {string} messages
     * @param {string} opts
     */
    chatBegin(messages, opts) {
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passStringToWasm0(messages, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passStringToWasm0(opts, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.model_chatBegin(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Answers a chat: `messages` is a JSON list of `{role, content}`, rendered by the
     * model's chat template; `opts` a JSON object (`max_tokens`, `temperature`,
     * `top_k`, `top_p`, `min_p`, `repeat_penalty`, `presence_penalty`,
     * `frequency_penalty`, `seed`, and `thinking`, a boolean
     * the template receives as `enable_thinking`). `on_piece(text, reasoning)` receives
     * the answer as it is decoded, `reasoning` true for a thinking model's reasoning
     * (told apart as `inga serve` does), and stops it by returning `true`. Returns the
     * statistics as JSON (with `reasoning_tokens`).
     * @param {string} messages
     * @param {string} opts
     * @param {Function} on_piece
     * @returns {string}
     */
    chat(messages, opts, on_piece) {
        let deferred4_0;
        let deferred4_1;
        try {
            let ptr0, len0, ptr1, len1;
            try {
                ptr0 = passStringToWasm0(messages, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
                len0 = WASM_VECTOR_LEN;
                ptr1 = passStringToWasm0(opts, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
                len1 = WASM_VECTOR_LEN;
            } catch (e) {
                if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
                if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
                throw e;
            }
            const ret = wasm.model_chat(this.__wbg_ptr, ptr0, len0, ptr1, len1, on_piece);
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    /**
     * Starts continuing `text` as written, generated a token at a time.
     * @param {string} text
     * @param {string} opts
     */
    completeBegin(text, opts) {
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passStringToWasm0(opts, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.model_completeBegin(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * Continues `text` as written (no chat template), as [`Model::chat`]; every piece
     * is answer (`reasoning` false).
     * @param {string} text
     * @param {string} opts
     * @param {Function} on_piece
     * @returns {string}
     */
    complete(text, opts, on_piece) {
        let deferred4_0;
        let deferred4_1;
        try {
            let ptr0, len0, ptr1, len1;
            try {
                ptr0 = passStringToWasm0(text, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
                len0 = WASM_VECTOR_LEN;
                ptr1 = passStringToWasm0(opts, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
                len1 = WASM_VECTOR_LEN;
            } catch (e) {
                if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
                if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
                throw e;
            }
            const ret = wasm.model_complete(this.__wbg_ptr, ptr0, len0, ptr1, len1, on_piece);
            var ptr3 = ret[0];
            var len3 = ret[1];
            if (ret[3]) {
                ptr3 = 0; len3 = 0;
                throw takeFromExternrefTable0(ret[2]);
            }
            deferred4_0 = ptr3;
            deferred4_1 = len3;
            return getStringFromWasm0(ptr3, len3);
        } finally {
            wasm.__wbindgen_free(deferred4_0, deferred4_1, 1);
        }
    }
    /**
     * How many tokens the chat `messages` (as [`Model::chat`]) takes in the context,
     * rendered by the chat template with `opts`' `thinking`: the page's context gauge.
     * @param {string} messages
     * @param {string} opts
     * @returns {number}
     */
    countChat(messages, opts) {
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passStringToWasm0(messages, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passStringToWasm0(opts, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.model_countChat(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * What the model is, as JSON (name, architecture, layers, vocabulary, bytes,
     * context, instruction set, threads, chat template; the layers read from the file
     * while running, the output layer's parts, the tables read by row, the bytes read
     * per token, the read buffers, the weights in memory, the KV cache, the activations'
     * estimate, the memory planned, whether it fits the budget).
     * @returns {string}
     */
    info() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.model_info(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * Resolves once the GPU's result a step waits for is there (at once when none
     * is awaited).
     * @returns {Promise<any>}
     */
    ready() {
        const ret = wasm.model_ready(this.__wbg_ptr);
        return ret;
    }
    /**
     * Forgets the conversation (an empty KV cache).
     */
    reset() {
        const ret = wasm.model_reset(this.__wbg_ptr);
        if (ret[1]) {
            throw takeFromExternrefTable0(ret[0]);
        }
    }
    /**
     * The statistics of the answer [`Model::step`] generated, as JSON (those of
     * [`Model::chat`], plus `steps_waiting`: the steps that waited for the GPU).
     * @returns {string}
     */
    stats() {
        let deferred1_0;
        let deferred1_1;
        try {
            const ret = wasm.model_stats(this.__wbg_ptr);
            deferred1_0 = ret[0];
            deferred1_1 = ret[1];
            return getStringFromWasm0(ret[0], ret[1]);
        } finally {
            wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
        }
    }
    /**
     * The next token of the answer begun: 0 when a token came (its text given to
     * `on_piece(text, reasoning)` as [`Model::chat`] does, which stops the answer by
     * returning `true`), 1 when the step waits
     * for the GPU (`await model.ready()`, then step again), 2 when the answer is over
     * ([`Model::stats`]).
     * @param {Function} on_piece
     * @returns {number}
     */
    step(on_piece) {
        const ret = wasm.model_step(this.__wbg_ptr, on_piece);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0];
    }
    /**
     * Starts processing ahead the part of the chat `messages` (as [`Model::chat`]'s)
     * before its next user message, with `opts`' `thinking`; returns its tokens, which
     * [`Model::warm_step`] processes a pass at a time (the worker yields between them,
     * so a question that comes stops it).
     * @param {string} messages
     * @param {string} opts
     * @returns {number}
     */
    warmBegin(messages, opts) {
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passStringToWasm0(messages, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = passStringToWasm0(opts, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.model_warmBegin(this.__wbg_ptr, ptr0, len0, ptr1, len1);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
    /**
     * Processes the next `pass` tokens of the warm-up; returns the tokens of it the cache
     * holds from its start.
     * @param {number} pass
     * @returns {number}
     */
    warmStep(pass) {
        const ret = wasm.model_warmStep(this.__wbg_ptr, pass);
        if (ret[2]) {
            throw takeFromExternrefTable0(ret[1]);
        }
        return ret[0] >>> 0;
    }
}
if (Symbol.dispose) Model.prototype[Symbol.dispose] = Model.prototype.free;

/**
 * Every WebGPU kernel's WGSL, as a JSON array of `[name, wgsl]`: the worker compiles
 * them all on a device of its own (`{type: "gpucheck"}`, the browser tests), what
 * `WebGpu::check_kernels` does natively (an error scope per kernel through wgpu would
 * add about 1 MB to this module).
 * @returns {string}
 */
export function gpuKernels() {
    let deferred1_0;
    let deferred1_1;
    try {
        const ret = wasm.gpuKernels();
        deferred1_0 = ret[0];
        deferred1_1 = ret[1];
        return getStringFromWasm0(ret[0], ret[1]);
    } finally {
        wasm.__wbindgen_free(deferred1_0, deferred1_1, 1);
    }
}

/**
 * Which of the first layers of the model of `size` bytes that `read(at, view)` reads
 * the GPU could run (`ctx`: 0 for 2048), from its header alone, before any GPU is
 * opened (`crate::gpu_layers`), as JSON: `layers` (how many of the first ones, by
 * their kind and their weights' types: no budget counted), `of` (the model's) and
 * `why` (why not more; null when it could run them all). The worker asks it before a
 * load on the GPU and loads a model the GPU would run none of on the CPU straight
 * away.
 *
 * # Errors
 * A header that cannot be read.
 * @param {string} name
 * @param {number} size
 * @param {Function} read
 * @param {number} ctx
 * @returns {string}
 */
export function gpuPlan(name, size, read, ctx) {
    let deferred5_0;
    let deferred5_1;
    try {
        const val2 = +size;
        const val3 = +ctx;
        const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.gpuPlan(ptr0, len0, val2, read, val3);
        var ptr4 = ret[0];
        var len4 = ret[1];
        if (ret[3]) {
            ptr4 = 0; len4 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred5_0 = ptr4;
        deferred5_1 = len4;
        return getStringFromWasm0(ptr4, len4);
    } finally {
        wasm.__wbindgen_free(deferred5_0, deferred5_1, 1);
    }
}

/**
 * Whether this module has threads: built with `+atomics` (shared memory) by
 * `tools/build-wasm.sh` into `web/pkg-threads/`, which the page loads only when it is
 * cross-origin isolated.
 * @returns {boolean}
 */
export function hasThreads() {
    const ret = wasm.hasThreads();
    return ret !== 0;
}

/**
 * Whether this module has the WebGPU path (the module without threads; the threaded
 * one runs on the CPU only).
 * @returns {boolean}
 */
export function hasWebGpu() {
    const ret = wasm.hasWebGpu();
    return ret !== 0;
}

/**
 * The message of the last Rust panic (where and why the module stopped), once, or
 * `undefined`: what the worker reports when a call traps. The model that was running
 * must not be used again.
 * @returns {string | undefined}
 */
export function lastPanic() {
    const ret = wasm.lastPanic();
    let v1;
    if (ret[0] !== 0) {
        v1 = getStringFromWasm0(ret[0], ret[1]);
        wasm.__wbindgen_free(ret[0], ret[1] * 1, 1);
    }
    return v1;
}

/**
 * The size of the module's memory in bytes: WebAssembly memory only grows, so this is
 * also its peak.
 * @returns {number}
 */
export function memoryBytes() {
    const ret = wasm.memoryBytes();
    return ret;
}

/**
 * Opens the GGUF model of `size` bytes that `read(at, view)` reads (see `JsReader`:
 * a file of the Origin Private File System through its synchronous access handle,
 * which must stay open while the model is used), named `name`, with a conversation of
 * `ctx` tokens (0: 2048). Within `budget` bytes of memory for the model (its KV cache
 * and activations included; negative: no limit, all in memory), what does not fit is
 * read from the file while it runs: the token and per-layer embeddings a row per
 * token, the output layer and the last layers whole at every token (`Runner::from_source`);
 * a model that cannot fit is refused with the reason. `info()` says what is read and
 * how many bytes. `progress(done, total)`, if given, follows the load.
 *
 * With `draftName`, `draftSize` and `draftRead` (a second file, read the same way), a
 * smaller model of the same vocabulary drafts for it, `draftTokens` tokens before each
 * check (0 or none: 4): held whole in memory, its weights, KV cache and activations
 * out of `budget` (`Runner::from_sources`). A draft of another vocabulary, or one that
 * does not fit `budget` alone, is refused before any weight is read. `kv`: how the
 * KV cache stores keys and values (`f16`, `q8_0`, `q4_0`; none: f16).
 * @param {string} name
 * @param {number} size
 * @param {Function} read
 * @param {number} budget
 * @param {number} ctx
 * @param {Function | null} [progress]
 * @param {string | null} [draft_name]
 * @param {number | null} [draft_size]
 * @param {Function | null} [draft_read]
 * @param {number | null} [draft_tokens]
 * @param {string | null} [kv]
 * @returns {Model}
 */
export function openModel(name, size, read, budget, ctx, progress, draft_name, draft_size, draft_read, draft_tokens, kv) {
    const val4 = +size;
    const val5 = +budget;
    const val6 = +ctx;
    const val7 = +(isLikeNone(draft_size) ? 0 : draft_size);
    const val8 = +(isLikeNone(draft_tokens) ? Number.MAX_SAFE_INTEGER : (draft_tokens) >>> 0);
    let ptr0, len0, ptr1, len1, ptr2, len2;
    try {
        ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len0 = WASM_VECTOR_LEN;
        ptr1 = isLikeNone(draft_name) ? 0 : passStringToWasm0(draft_name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len1 = WASM_VECTOR_LEN;
        ptr2 = isLikeNone(kv) ? 0 : passStringToWasm0(kv, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
        len2 = WASM_VECTOR_LEN;
    } catch (e) {
        if (ptr2) { wasm.__wbindgen_free(ptr2, len2 * 1, 1); }
        if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
        if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
        throw e;
    }
    const ret = wasm.openModel(ptr0, len0, val4, read, val5, val6, isLikeNone(progress) ? 0 : addToExternrefTable0(progress), ptr1, len1, !isLikeNone(draft_size), val7, isLikeNone(draft_read) ? 0 : addToExternrefTable0(draft_read), val8, ptr2, len2);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Model.__wrap(ret[0]);
}

/**
 * [`open_model`] with the first layers on `gpu`: as many as fit `gpuBudget` bytes there
 * (their weights, KV cache and activations), the output layer too when it holds them
 * all, the rest on the CPU as `openModel` runs it (`gpuBudget` negative: no budget but
 * `budget`). `budget` (negative: none) counts the
 * GPU's bytes with WebAssembly memory, unless `separate` is true: then it bounds
 * WebAssembly memory alone and the GPU's bytes only `gpuBudget` (a browser that does
 * not count GPU buffers with the tab's memory; `info()`'s `gpu_accounting` says which
 * was used). The GPU's weights go from the file to its
 * buffers a few MB at a time. `info()` says how many layers run there (`gpu_layers`,
 * `gpu_head`) and why not more (`gpu_note`). The model answers a token at a time
 * (`chatBegin`, `step`). No draft model on the GPU yet.
 * @param {Gpu} gpu
 * @param {string} name
 * @param {number} size
 * @param {Function} read
 * @param {number} budget
 * @param {number} gpu_budget
 * @param {number} ctx
 * @param {Function | null} [progress]
 * @param {boolean | null} [separate]
 * @returns {Model}
 */
export function openModelGpu(gpu, name, size, read, budget, gpu_budget, ctx, progress, separate) {
    _assertClass(gpu, Gpu);
    const val2 = +size;
    const val3 = +budget;
    const val4 = +gpu_budget;
    const val5 = +ctx;
    const ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    const ret = wasm.openModelGpu(gpu.__wbg_ptr, ptr0, len0, val2, read, val3, val4, val5, isLikeNone(progress) ? 0 : addToExternrefTable0(progress), isLikeNone(separate) ? 0xFFFFFF : separate ? 1 : 0);
    if (ret[2]) {
        throw takeFromExternrefTable0(ret[1]);
    }
    return Model.__wrap(ret[0]);
}

/**
 * How [`open_model`] would hold the model of `size` bytes that `read(at, view)` reads
 * within `budget` bytes (negative: no limit) and a context of `ctx` tokens (0: 2048),
 * planned from its header before any weight is read, as JSON: `streamed_layers`,
 * `output_parts`, `read_by_row` (what it would read from storage while it runs: a model
 * needs storage when any is not 0), `total` and `fits`. The worker asks it before a load
 * on the GPU: a model that needs storage runs slower with the GPU's bytes in the same
 * limit (Device Auto keeps it on the CPU). `kv`: the KV cache's type, as `openModel`.
 *
 * # Errors
 * A header that cannot be read; a model that cannot fit (the reason).
 * @param {string} name
 * @param {number} size
 * @param {Function} read
 * @param {number} budget
 * @param {number} ctx
 * @param {string | null} [kv]
 * @returns {string}
 */
export function planModel(name, size, read, budget, ctx, kv) {
    let deferred7_0;
    let deferred7_1;
    try {
        const val3 = +size;
        const val4 = +budget;
        const val5 = +ctx;
        let ptr0, len0, ptr1, len1;
        try {
            ptr0 = passStringToWasm0(name, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len0 = WASM_VECTOR_LEN;
            ptr1 = isLikeNone(kv) ? 0 : passStringToWasm0(kv, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            len1 = WASM_VECTOR_LEN;
        } catch (e) {
            if (ptr1) { wasm.__wbindgen_free(ptr1, len1 * 1, 1); }
            if (ptr0) { wasm.__wbindgen_free(ptr0, len0 * 1, 1); }
            throw e;
        }
        const ret = wasm.planModel(ptr0, len0, val3, read, val4, val5, ptr1, len1);
        var ptr6 = ret[0];
        var len6 = ret[1];
        if (ret[3]) {
            ptr6 = 0; len6 = 0;
            throw takeFromExternrefTable0(ret[2]);
        }
        deferred7_0 = ptr6;
        deferred7_1 = len6;
        return getStringFromWasm0(ptr6, len6);
    } finally {
        wasm.__wbindgen_free(deferred7_0, deferred7_1, 1);
    }
}

/**
 * A Rust panic printed on the console, with the JavaScript stack (the WebAssembly
 * functions' names), and kept for [`last_panic`], before the module traps (the trap
 * itself only says "unreachable").
 */
export function start() {
    wasm.start();
}

/**
 * Stops the answer running at its next token. A generation runs synchronously on the
 * thread that started it, so this can be called only from code running meanwhile on
 * that thread: the `on_piece` callback.
 */
export function stop() {
    wasm.stop();
}

/**
 * Makes the module panic with `what`, to test that the page shows the message
 * (`browser.cjs`).
 * @param {string} what
 */
export function testPanic(what) {
    const ptr0 = passStringToWasm0(what, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
    const len0 = WASM_VECTOR_LEN;
    wasm.testPanic(ptr0, len0);
}

/**
 * The Web Workers waiting in [`run_worker`]: the threads a model loaded now gets
 * besides the calling one (always 0 in the module without threads).
 * @returns {number}
 */
export function waitingWorkers() {
    const ret = wasm.waitingWorkers();
    return ret >>> 0;
}
function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_208446807d0d1e30: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_Window_2805651c516cb7aa: function(arg0) {
            const ret = arg0.Window;
            return ret;
        },
        __wbg_WorkerGlobalScope_174390815d0a4893: function(arg0) {
            const ret = arg0.WorkerGlobalScope;
            return ret;
        },
        __wbg___wbindgen_debug_string_f249a2a76caa9a55: function(arg0, arg1) {
            const ret = debugString(arg1);
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_is_falsy_d864b623500ae65d: function(arg0) {
            const ret = !arg0;
            return ret;
        },
        __wbg___wbindgen_is_function_741ff2bb612836f5: function(arg0) {
            const ret = typeof(arg0) === 'function';
            return ret;
        },
        __wbg___wbindgen_is_null_c22311b1cc228e3a: function(arg0) {
            const ret = arg0 === null;
            return ret;
        },
        __wbg___wbindgen_is_string_fc456fee5d3317de: function(arg0) {
            const ret = typeof(arg0) === 'string';
            return ret;
        },
        __wbg___wbindgen_is_undefined_be5b34249ff1fc15: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_number_get_934b640d0889af78: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'number' ? obj : undefined;
            getDataViewMemory0().setFloat64((arg0 >>> 0) + 8 * 1, isLikeNone(ret) ? 0 : ret, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, !isLikeNone(ret), true);
        },
        __wbg___wbindgen_string_get_7ce8eee7fd327545: function(arg0, arg1) {
            const obj = arg1;
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_4c88d8bf264fd984: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg__wbg_cb_unref_09736879a3f67559: function(arg0) {
            arg0._wbg_cb_unref();
        },
        __wbg_beginComputePass_b9a325184985e6ff: function(arg0, arg1) {
            const ret = arg0.beginComputePass(arg1);
            return ret;
        },
        __wbg_call_40b008ba32f73991: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.call(arg1);
            return ret;
        }, arguments); },
        __wbg_call_a410eb4b59ed5965: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.call(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_call_fc92fee6137d452d: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg0.call(arg1, arg2, arg3);
            return ret;
        }, arguments); },
        __wbg_configure_8e04ab1a867d31e1: function() { return handleError(function (arg0, arg1) {
            arg0.configure(arg1);
        }, arguments); },
        __wbg_copyBufferToBuffer_0c93ff5b22a585e9: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5) {
            arg0.copyBufferToBuffer(arg1, arg2, arg3, arg4, arg5);
        }, arguments); },
        __wbg_copyBufferToBuffer_d04fe4341d6e0f6a: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            arg0.copyBufferToBuffer(arg1, arg2, arg3, arg4);
        }, arguments); },
        __wbg_createBindGroup_f539b26ca341308f: function(arg0, arg1) {
            const ret = arg0.createBindGroup(arg1);
            return ret;
        },
        __wbg_createBuffer_b8c5b520d2c822b8: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.createBuffer(arg1);
            return ret;
        }, arguments); },
        __wbg_createCommandEncoder_3352d1ffc36c6fc0: function(arg0, arg1) {
            const ret = arg0.createCommandEncoder(arg1);
            return ret;
        },
        __wbg_createComputePipeline_224fa2618d9948a0: function(arg0, arg1) {
            const ret = arg0.createComputePipeline(arg1);
            return ret;
        },
        __wbg_createQuerySet_4a3a1eb942cab7ca: function() { return handleError(function (arg0, arg1) {
            const ret = arg0.createQuerySet(arg1);
            return ret;
        }, arguments); },
        __wbg_createShaderModule_cefa51336cb288ae: function(arg0, arg1) {
            const ret = arg0.createShaderModule(arg1);
            return ret;
        },
        __wbg_description_7a568e202a00293f: function(arg0, arg1) {
            const ret = arg1.description;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_destroy_275564a0a8b8d071: function(arg0) {
            arg0.destroy();
        },
        __wbg_dispatchWorkgroups_56b943172790add0: function(arg0, arg1, arg2, arg3) {
            arg0.dispatchWorkgroups(arg1 >>> 0, arg2 >>> 0, arg3 >>> 0);
        },
        __wbg_end_82fd0c12ba185009: function(arg0) {
            arg0.end();
        },
        __wbg_error_200e102bfa5a385c: function(arg0, arg1) {
            console.error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_error_4e2c22b7e3952509: function(arg0) {
            const ret = arg0.error;
            return ret;
        },
        __wbg_features_7b0a0ba10b61a5e4: function(arg0) {
            const ret = arg0.features;
            return ret;
        },
        __wbg_features_d5d767fa7757f783: function(arg0) {
            const ret = arg0.features;
            return ret;
        },
        __wbg_finish_09ec094c10f41e7b: function(arg0) {
            const ret = arg0.finish();
            return ret;
        },
        __wbg_finish_ec1c191f66a895b1: function(arg0, arg1) {
            const ret = arg0.finish(arg1);
            return ret;
        },
        __wbg_getBindGroupLayout_349f9101ad6d4d76: function(arg0, arg1) {
            const ret = arg0.getBindGroupLayout(arg1 >>> 0);
            return ret;
        },
        __wbg_getContext_1938edb9a972f63d: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.getContext(getStringFromWasm0(arg1, arg2));
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        }, arguments); },
        __wbg_getMappedRange_28e816a763520e01: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = arg0.getMappedRange(arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_get_2080c49015e35254: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_gpu_514705c6dd1f0dab: function(arg0) {
            const ret = arg0.gpu;
            return ret;
        },
        __wbg_gpu_new: function(arg0) {
            const ret = Gpu.__wrap(arg0);
            return ret;
        },
        __wbg_has_eafa12e457ea88fb: function(arg0, arg1, arg2) {
            const ret = arg0.has(getStringFromWasm0(arg1, arg2));
            return ret;
        },
        __wbg_info_8554cb7af37427b6: function(arg0) {
            const ret = arg0.info;
            return ret;
        },
        __wbg_instanceof_GpuOutOfMemoryError_7126123117d274a4: function(arg0) {
            let result;
            try {
                result = arg0 instanceof GPUOutOfMemoryError;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_instanceof_GpuValidationError_f18d09609dc737d7: function(arg0) {
            let result;
            try {
                result = arg0 instanceof GPUValidationError;
            } catch (_) {
                result = false;
            }
            const ret = result;
            return ret;
        },
        __wbg_isFallbackAdapter_6a4fa7356d18310b: function(arg0) {
            const ret = arg0.isFallbackAdapter;
            return ret;
        },
        __wbg_label_fceb40a43a358e62: function(arg0, arg1) {
            const ret = arg1.label;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_length_186163212ffe79c3: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_limits_4e444eb8c2e61c45: function(arg0) {
            const ret = arg0.limits;
            return ret;
        },
        __wbg_mapAsync_b0597127f5037286: function(arg0, arg1, arg2, arg3) {
            const ret = arg0.mapAsync(arg1 >>> 0, arg2, arg3);
            return ret;
        },
        __wbg_maxBindGroupsPlusVertexBuffers_1face4afb5363937: function(arg0) {
            const ret = arg0.maxBindGroupsPlusVertexBuffers;
            return ret;
        },
        __wbg_maxBindGroups_a0b7e55762f095b9: function(arg0) {
            const ret = arg0.maxBindGroups;
            return ret;
        },
        __wbg_maxBindingsPerBindGroup_ec9067be38d6ec72: function(arg0) {
            const ret = arg0.maxBindingsPerBindGroup;
            return ret;
        },
        __wbg_maxBufferSize_a9ce15e541c64cd2: function(arg0) {
            const ret = arg0.maxBufferSize;
            return ret;
        },
        __wbg_maxColorAttachmentBytesPerSample_44089e129e1a2a1d: function(arg0) {
            const ret = arg0.maxColorAttachmentBytesPerSample;
            return ret;
        },
        __wbg_maxColorAttachments_6bd8156394ba618c: function(arg0) {
            const ret = arg0.maxColorAttachments;
            return ret;
        },
        __wbg_maxComputeInvocationsPerWorkgroup_7b086f15ef868934: function(arg0) {
            const ret = arg0.maxComputeInvocationsPerWorkgroup;
            return ret;
        },
        __wbg_maxComputeWorkgroupSizeX_8bbe505e0ac8dc18: function(arg0) {
            const ret = arg0.maxComputeWorkgroupSizeX;
            return ret;
        },
        __wbg_maxComputeWorkgroupSizeY_7228ed3935eecc31: function(arg0) {
            const ret = arg0.maxComputeWorkgroupSizeY;
            return ret;
        },
        __wbg_maxComputeWorkgroupSizeZ_6092b56a967f6f8d: function(arg0) {
            const ret = arg0.maxComputeWorkgroupSizeZ;
            return ret;
        },
        __wbg_maxComputeWorkgroupStorageSize_4773e3bd3936df36: function(arg0) {
            const ret = arg0.maxComputeWorkgroupStorageSize;
            return ret;
        },
        __wbg_maxComputeWorkgroupsPerDimension_79222bf8e8a90fbd: function(arg0) {
            const ret = arg0.maxComputeWorkgroupsPerDimension;
            return ret;
        },
        __wbg_maxDynamicStorageBuffersPerPipelineLayout_3ab5762b1b2c7fc2: function(arg0) {
            const ret = arg0.maxDynamicStorageBuffersPerPipelineLayout;
            return ret;
        },
        __wbg_maxDynamicUniformBuffersPerPipelineLayout_722da31d0de1c256: function(arg0) {
            const ret = arg0.maxDynamicUniformBuffersPerPipelineLayout;
            return ret;
        },
        __wbg_maxInterStageShaderVariables_821096d4b3020715: function(arg0) {
            const ret = arg0.maxInterStageShaderVariables;
            return ret;
        },
        __wbg_maxSampledTexturesPerShaderStage_c6aea9e05c0a02ca: function(arg0) {
            const ret = arg0.maxSampledTexturesPerShaderStage;
            return ret;
        },
        __wbg_maxSamplersPerShaderStage_3aa30f6c002d3a99: function(arg0) {
            const ret = arg0.maxSamplersPerShaderStage;
            return ret;
        },
        __wbg_maxStorageBufferBindingSize_84a2c2433627fca2: function(arg0) {
            const ret = arg0.maxStorageBufferBindingSize;
            return ret;
        },
        __wbg_maxStorageBuffersPerShaderStage_25b96748df28dc20: function(arg0) {
            const ret = arg0.maxStorageBuffersPerShaderStage;
            return ret;
        },
        __wbg_maxStorageTexturesPerShaderStage_53ed734f26e6c1ad: function(arg0) {
            const ret = arg0.maxStorageTexturesPerShaderStage;
            return ret;
        },
        __wbg_maxTextureArrayLayers_9ec487f1ce102992: function(arg0) {
            const ret = arg0.maxTextureArrayLayers;
            return ret;
        },
        __wbg_maxTextureDimension1D_faef91b2e9fa6740: function(arg0) {
            const ret = arg0.maxTextureDimension1D;
            return ret;
        },
        __wbg_maxTextureDimension2D_3a923eb2df4d9124: function(arg0) {
            const ret = arg0.maxTextureDimension2D;
            return ret;
        },
        __wbg_maxTextureDimension3D_943321fe5945464e: function(arg0) {
            const ret = arg0.maxTextureDimension3D;
            return ret;
        },
        __wbg_maxUniformBufferBindingSize_21e89ff761d576db: function(arg0) {
            const ret = arg0.maxUniformBufferBindingSize;
            return ret;
        },
        __wbg_maxUniformBuffersPerShaderStage_19a0bfb0189f7254: function(arg0) {
            const ret = arg0.maxUniformBuffersPerShaderStage;
            return ret;
        },
        __wbg_maxVertexAttributes_49aef6c51d07a280: function(arg0) {
            const ret = arg0.maxVertexAttributes;
            return ret;
        },
        __wbg_maxVertexBufferArrayStride_f68c4029e6f047ec: function(arg0) {
            const ret = arg0.maxVertexBufferArrayStride;
            return ret;
        },
        __wbg_maxVertexBuffers_ce9f15a623f9aac7: function(arg0) {
            const ret = arg0.maxVertexBuffers;
            return ret;
        },
        __wbg_message_408f555d03641e84: function(arg0, arg1) {
            const ret = arg1.message;
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_malloc, wasm.__wbindgen_realloc);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 1, len1, true);
            getDataViewMemory0().setInt32((arg0 >>> 0) + 4 * 0, ptr1, true);
        },
        __wbg_minStorageBufferOffsetAlignment_529f1f52e61188fc: function(arg0) {
            const ret = arg0.minStorageBufferOffsetAlignment;
            return ret;
        },
        __wbg_minUniformBufferOffsetAlignment_519e26287e1996a3: function(arg0) {
            const ret = arg0.minUniformBufferOffsetAlignment;
            return ret;
        },
        __wbg_navigator_9641ab32fa612dd1: function(arg0) {
            const ret = arg0.navigator;
            return ret;
        },
        __wbg_navigator_c17f443a6fe5d38d: function(arg0) {
            const ret = arg0.navigator;
            return ret;
        },
        __wbg_new_2bfd0f45e60518b1: function() { return handleError(function (arg0, arg1) {
            const ret = new OffscreenCanvas(arg0 >>> 0, arg1 >>> 0);
            return ret;
        }, arguments); },
        __wbg_new_787b9fb330d55d78: function(arg0, arg1) {
            const ret = new Error(getStringFromWasm0(arg0, arg1));
            return ret;
        },
        __wbg_new_ba40181b3f24ac80: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___js_sys_83f882ee24f1a480___Function_fn_wasm_bindgen_5de4d1870d8ca90b___JsValue_____wasm_bindgen_5de4d1870d8ca90b___sys__Undefined___js_sys_83f882ee24f1a480___Function_fn_wasm_bindgen_5de4d1870d8ca90b___JsValue_____wasm_bindgen_5de4d1870d8ca90b___sys__Undefined_______true_(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_cd4348290afae586: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_typed_6b60b99917da27d6: function() {
            const ret = new Object();
            return ret;
        },
        __wbg_new_typed_e09da9dae6ee5935: function(arg0, arg1) {
            try {
                var state0 = {a: arg0, b: arg1};
                var cb0 = (arg0, arg1) => {
                    const a = state0.a;
                    state0.a = 0;
                    try {
                        return wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___js_sys_83f882ee24f1a480___Function_fn_wasm_bindgen_5de4d1870d8ca90b___JsValue_____wasm_bindgen_5de4d1870d8ca90b___sys__Undefined___js_sys_83f882ee24f1a480___Function_fn_wasm_bindgen_5de4d1870d8ca90b___JsValue_____wasm_bindgen_5de4d1870d8ca90b___sys__Undefined_______true_(a, state0.b, arg0, arg1);
                    } finally {
                        state0.a = a;
                    }
                };
                const ret = new Promise(cb0);
                return ret;
            } finally {
                state0.a = 0;
            }
        },
        __wbg_new_with_byte_offset_and_length_3cd32055a417f095: function(arg0, arg1, arg2) {
            const ret = new Uint8Array(arg0, arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_now_463ac581d2fc7ea3: function() {
            const ret = Date.now();
            return ret;
        },
        __wbg_now_e7c6795a7f81e10f: function(arg0) {
            const ret = arg0.now();
            return ret;
        },
        __wbg_onSubmittedWorkDone_1190213cee1ecf7e: function(arg0) {
            const ret = arg0.onSubmittedWorkDone();
            return ret;
        },
        __wbg_performance_7e4e4494fdc9d07a: function(arg0) {
            const ret = arg0.performance;
            return ret;
        },
        __wbg_prototypesetcall_13162965d1fe7aa3: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_queueMicrotask_1e8503a8a690f0a3: function(arg0) {
            const ret = arg0.queueMicrotask;
            return ret;
        },
        __wbg_queueMicrotask_4a1a4d8dd332373b: function(arg0) {
            queueMicrotask(arg0);
        },
        __wbg_queue_e250e2ebc49b39e0: function(arg0) {
            const ret = arg0.queue;
            return ret;
        },
        __wbg_requestAdapter_a539af006419f2e9: function(arg0, arg1) {
            const ret = arg0.requestAdapter(arg1);
            return ret;
        },
        __wbg_requestDevice_5cb8a582e55d08cb: function(arg0, arg1) {
            const ret = arg0.requestDevice(arg1);
            return ret;
        },
        __wbg_resolveQuerySet_770f23fabac49845: function(arg0, arg1, arg2, arg3, arg4, arg5) {
            arg0.resolveQuerySet(arg1, arg2 >>> 0, arg3 >>> 0, arg4, arg5 >>> 0);
        },
        __wbg_resolve_dbf78ab4942478b0: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
        },
        __wbg_setBindGroup_4aa88516c8ab99c4: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            arg0.setBindGroup(arg1 >>> 0, arg2, getArrayU32FromWasm0(arg3, arg4), arg5, arg6 >>> 0);
        }, arguments); },
        __wbg_setBindGroup_c83391351ce68826: function(arg0, arg1, arg2) {
            arg0.setBindGroup(arg1 >>> 0, arg2);
        },
        __wbg_setPipeline_5146f7b8d2b4af5c: function(arg0, arg1) {
            arg0.setPipeline(arg1);
        },
        __wbg_set_118fefd528ab0a79: function(arg0, arg1, arg2) {
            arg0.set(arg1, arg2 >>> 0);
        },
        __wbg_set_2793479888329cb6: function() { return handleError(function (arg0, arg1, arg2) {
            const ret = Reflect.set(arg0, arg1, arg2);
            return ret;
        }, arguments); },
        __wbg_set_beginning_of_pass_write_index_c49071ff9c074e31: function(arg0, arg1) {
            arg0.beginningOfPassWriteIndex = arg1 >>> 0;
        },
        __wbg_set_binding_bd7d6b01bb08823a: function(arg0, arg1) {
            arg0.binding = arg1 >>> 0;
        },
        __wbg_set_buffer_91f4e8e05066c37a: function(arg0, arg1) {
            arg0.buffer = arg1;
        },
        __wbg_set_code_130aebc49c4cadd3: function(arg0, arg1, arg2) {
            arg0.code = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_compute_800b1231f347606b: function(arg0, arg1) {
            arg0.compute = arg1;
        },
        __wbg_set_count_dc87e26bec5f6dc3: function(arg0, arg1) {
            arg0.count = arg1 >>> 0;
        },
        __wbg_set_device_1940fd5f9e2a7fee: function(arg0, arg1) {
            arg0.device = arg1;
        },
        __wbg_set_end_of_pass_write_index_891ac71cf6a560c5: function(arg0, arg1) {
            arg0.endOfPassWriteIndex = arg1 >>> 0;
        },
        __wbg_set_entries_d9929dbfa2aaa9a7: function(arg0, arg1, arg2) {
            arg0.entries = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_entry_point_6c86140cb6e5243a: function(arg0, arg1, arg2) {
            arg0.entryPoint = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_format_46b1c6b3acc10b24: function(arg0, arg1) {
            arg0.format = __wbindgen_enum_GpuTextureFormat[arg1];
        },
        __wbg_set_label_08745022b1ec7b66: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_5347fc976d15e94c: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_644bc1b32c7917b0: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_73c99dab6708c962: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_891876dd0e225368: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_89d2ffaf598df6a4: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_a7095396911c5801: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_cba03ffef7ae90a3: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_label_d0d693a97f5be626: function(arg0, arg1, arg2) {
            arg0.label = getStringFromWasm0(arg1, arg2);
        },
        __wbg_set_layout_200fc3b143da0a9e: function(arg0, arg1) {
            arg0.layout = arg1;
        },
        __wbg_set_layout_599d761209e4b03f: function(arg0, arg1) {
            arg0.layout = arg1;
        },
        __wbg_set_layout_gpu_auto_layout_mode_eb40dfd1eca5b9d3: function(arg0, arg1) {
            arg0.layout = __wbindgen_enum_GpuAutoLayoutMode[arg1];
        },
        __wbg_set_mapped_at_creation_8af5b87ccb898bbe: function(arg0, arg1) {
            arg0.mappedAtCreation = arg1 !== 0;
        },
        __wbg_set_module_05c14f520e88acaa: function(arg0, arg1) {
            arg0.module = arg1;
        },
        __wbg_set_offset_f64_9374d9e912985773: function(arg0, arg1) {
            arg0.offset = arg1;
        },
        __wbg_set_onuncapturederror_19ad0d0daa325d10: function(arg0, arg1) {
            arg0.onuncapturederror = arg1;
        },
        __wbg_set_power_preference_6bc1d2697a0e7374: function(arg0, arg1) {
            arg0.powerPreference = __wbindgen_enum_GpuPowerPreference[arg1];
        },
        __wbg_set_query_set_6acda8912691b8d6: function(arg0, arg1) {
            arg0.querySet = arg1;
        },
        __wbg_set_required_features_5bda1420e19461b2: function(arg0, arg1, arg2) {
            arg0.requiredFeatures = getArrayJsValueViewFromWasm0(arg1, arg2);
        },
        __wbg_set_required_limits_e78b923d73f9b596: function(arg0, arg1) {
            arg0.requiredLimits = arg1;
        },
        __wbg_set_resource_0f960a4279e7e400: function(arg0, arg1) {
            arg0.resource = arg1;
        },
        __wbg_set_resource_gpu_buffer_binding_53a2189a77dd38be: function(arg0, arg1) {
            arg0.resource = arg1;
        },
        __wbg_set_resource_gpu_texture_view_9153a2356b958667: function(arg0, arg1) {
            arg0.resource = arg1;
        },
        __wbg_set_size_f64_3ff72c0d736c42a1: function(arg0, arg1) {
            arg0.size = arg1;
        },
        __wbg_set_size_f64_9b65e4916b2eb111: function(arg0, arg1) {
            arg0.size = arg1;
        },
        __wbg_set_timestamp_writes_78a9445dbac5c902: function(arg0, arg1) {
            arg0.timestampWrites = arg1;
        },
        __wbg_set_type_813f0d8c7822259c: function(arg0, arg1) {
            arg0.type = __wbindgen_enum_GpuQueryType[arg1];
        },
        __wbg_set_usage_bac3cabe90090275: function(arg0, arg1) {
            arg0.usage = arg1 >>> 0;
        },
        __wbg_static_accessor_GLOBAL_THIS_003ee833af9699fc: function() {
            const ret = typeof globalThis === 'undefined' ? undefined : globalThis;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_GLOBAL_e4293fb22cbe77da: function() {
            const ret = typeof global === 'undefined' ? undefined : global;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_SELF_53bb20457401453d: function() {
            const ret = typeof self === 'undefined' ? undefined : self;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_static_accessor_WINDOW_b5e0810bfecb7feb: function() {
            const ret = typeof window === 'undefined' ? undefined : window;
            return isLikeNone(ret) ? 0 : addToExternrefTable0(ret);
        },
        __wbg_subarray_58f388a9247ac0bb: function(arg0, arg1, arg2) {
            const ret = arg0.subarray(arg1 >>> 0, arg2 >>> 0);
            return ret;
        },
        __wbg_subgroupMaxSize_3586e822dc3603f6: function(arg0) {
            const ret = arg0.subgroupMaxSize;
            return ret;
        },
        __wbg_subgroupMinSize_17f758985cdd1dab: function(arg0) {
            const ret = arg0.subgroupMinSize;
            return ret;
        },
        __wbg_submit_077c85cc28e36892: function(arg0, arg1, arg2) {
            arg0.submit(getArrayJsValueViewFromWasm0(arg1, arg2));
        },
        __wbg_then_656f253a5dd7d8ea: function(arg0, arg1, arg2) {
            const ret = arg0.then(arg1, arg2);
            return ret;
        },
        __wbg_then_e3f7f2d365708be8: function(arg0, arg1) {
            const ret = arg0.then(arg1);
            return ret;
        },
        __wbg_unconfigure_835307f58dc68d80: function(arg0) {
            arg0.unconfigure();
        },
        __wbg_unmap_6a96b14c9ef5f7f5: function(arg0) {
            arg0.unmap();
        },
        __wbg_valueOf_2ad4a09774ac959e: function(arg0) {
            const ret = arg0.valueOf();
            return ret;
        },
        __wbg_writeBuffer_d7640e64ceb69371: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4, arg5, arg6) {
            arg0.writeBuffer(arg1, arg2, getArrayU8FromWasm0(arg3, arg4), arg5, arg6);
        }, arguments); },
        __wbindgen_generic_0000000000000001: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [Externref], shim_idx: 2116, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___wasm_bindgen_5de4d1870d8ca90b___JsValue__core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_5de4d1870d8ca90b___JsError___true_);
            return ret;
        },
        __wbindgen_generic_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("GPUDevice")], shim_idx: 153, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___wasm_bindgen_5de4d1870d8ca90b___sys__JsNullable_wgpu_87f5b93ccdd93c7d___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_5de4d1870d8ca90b___JsError___true_);
            return ret;
        },
        __wbindgen_generic_0000000000000003: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("GPUUncapturedErrorEvent")], shim_idx: 157, ret: Unit, inner_ret: Some(Unit) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___wgpu_87f5b93ccdd93c7d___backend__webgpu__webgpu_sys__gen_GpuDeviceLostInfo__GpuDeviceLostInfo______true_);
            return ret;
        },
        __wbindgen_generic_0000000000000004: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("any")], shim_idx: 153, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___wasm_bindgen_5de4d1870d8ca90b___sys__JsNullable_wgpu_87f5b93ccdd93c7d___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_5de4d1870d8ca90b___JsError___true__42);
            return ret;
        },
        __wbindgen_generic_0000000000000005: function(arg0, arg1) {
            // Cast intrinsic for `Closure(Closure { owned: true, function: Function { arguments: [NamedExternref("undefined")], shim_idx: 153, ret: Result(Unit), inner_ret: Some(Result(Unit)) }, mutable: true }) -> Externref`.
            const ret = makeMutClosure(arg0, arg1, wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___wasm_bindgen_5de4d1870d8ca90b___sys__JsNullable_wgpu_87f5b93ccdd93c7d___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_5de4d1870d8ca90b___JsError___true__43);
            return ret;
        },
        __wbindgen_generic_0000000000000006: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_generic_0000000000000007: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_generic_0000000000000008: function(arg0, arg1) {
            // Cast intrinsic for `Ref(String) -> Externref`.
            const ret = getStringFromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_init_externref_table: function() {
            const table = wasm.__wbindgen_externrefs;
            table.set(0, undefined);
            table.set(1024, undefined);
            table.set(1025, null);
            table.set(1026, true);
            table.set(1027, false);
        },
    };
    return {
        __proto__: null,
        "./inga_wasm_bg.js": import0,
    };
}

function wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___wgpu_87f5b93ccdd93c7d___backend__webgpu__webgpu_sys__gen_GpuDeviceLostInfo__GpuDeviceLostInfo______true_(arg0, arg1, arg2) {
    wasm.wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___wgpu_87f5b93ccdd93c7d___backend__webgpu__webgpu_sys__gen_GpuDeviceLostInfo__GpuDeviceLostInfo______true_(arg0, arg1, arg2);
}

function wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___wasm_bindgen_5de4d1870d8ca90b___JsValue__core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_5de4d1870d8ca90b___JsError___true_(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___wasm_bindgen_5de4d1870d8ca90b___JsValue__core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_5de4d1870d8ca90b___JsError___true_(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___wasm_bindgen_5de4d1870d8ca90b___sys__JsNullable_wgpu_87f5b93ccdd93c7d___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_5de4d1870d8ca90b___JsError___true_(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___wasm_bindgen_5de4d1870d8ca90b___sys__JsNullable_wgpu_87f5b93ccdd93c7d___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_5de4d1870d8ca90b___JsError___true_(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___wasm_bindgen_5de4d1870d8ca90b___sys__JsNullable_wgpu_87f5b93ccdd93c7d___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_5de4d1870d8ca90b___JsError___true__42(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___wasm_bindgen_5de4d1870d8ca90b___sys__JsNullable_wgpu_87f5b93ccdd93c7d___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_5de4d1870d8ca90b___JsError___true__42(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___wasm_bindgen_5de4d1870d8ca90b___sys__JsNullable_wgpu_87f5b93ccdd93c7d___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_5de4d1870d8ca90b___JsError___true__43(arg0, arg1, arg2) {
    const ret = wasm.wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___wasm_bindgen_5de4d1870d8ca90b___sys__JsNullable_wgpu_87f5b93ccdd93c7d___backend__webgpu__webgpu_sys__gen_GpuError__GpuError___core_37ee0ce0c4cd57d5___result__Result_____wasm_bindgen_5de4d1870d8ca90b___JsError___true__43(arg0, arg1, arg2);
    if (ret[1]) {
        throw takeFromExternrefTable0(ret[0]);
    }
}

function wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___js_sys_83f882ee24f1a480___Function_fn_wasm_bindgen_5de4d1870d8ca90b___JsValue_____wasm_bindgen_5de4d1870d8ca90b___sys__Undefined___js_sys_83f882ee24f1a480___Function_fn_wasm_bindgen_5de4d1870d8ca90b___JsValue_____wasm_bindgen_5de4d1870d8ca90b___sys__Undefined_______true_(arg0, arg1, arg2, arg3) {
    wasm.wasm_bindgen_5de4d1870d8ca90b___convert__closures_____invoke___js_sys_83f882ee24f1a480___Function_fn_wasm_bindgen_5de4d1870d8ca90b___JsValue_____wasm_bindgen_5de4d1870d8ca90b___sys__Undefined___js_sys_83f882ee24f1a480___Function_fn_wasm_bindgen_5de4d1870d8ca90b___JsValue_____wasm_bindgen_5de4d1870d8ca90b___sys__Undefined_______true_(arg0, arg1, arg2, arg3);
}


const __wbindgen_enum_GpuAutoLayoutMode = ["auto"];


const __wbindgen_enum_GpuPowerPreference = ["low-power", "high-performance"];


const __wbindgen_enum_GpuQueryType = ["occlusion", "timestamp"];


const __wbindgen_enum_GpuTextureFormat = ["r8unorm", "r8snorm", "r8uint", "r8sint", "r16unorm", "r16snorm", "r16uint", "r16sint", "r16float", "rg8unorm", "rg8snorm", "rg8uint", "rg8sint", "r32uint", "r32sint", "r32float", "rg16unorm", "rg16snorm", "rg16uint", "rg16sint", "rg16float", "rgba8unorm", "rgba8unorm-srgb", "rgba8snorm", "rgba8uint", "rgba8sint", "bgra8unorm", "bgra8unorm-srgb", "rgb9e5ufloat", "rgb10a2uint", "rgb10a2unorm", "rg11b10ufloat", "rg32uint", "rg32sint", "rg32float", "rgba16unorm", "rgba16snorm", "rgba16uint", "rgba16sint", "rgba16float", "rgba32uint", "rgba32sint", "rgba32float", "stencil8", "depth16unorm", "depth24plus", "depth24plus-stencil8", "depth32float", "depth32float-stencil8", "bc1-rgba-unorm", "bc1-rgba-unorm-srgb", "bc2-rgba-unorm", "bc2-rgba-unorm-srgb", "bc3-rgba-unorm", "bc3-rgba-unorm-srgb", "bc4-r-unorm", "bc4-r-snorm", "bc5-rg-unorm", "bc5-rg-snorm", "bc6h-rgb-ufloat", "bc6h-rgb-float", "bc7-rgba-unorm", "bc7-rgba-unorm-srgb", "etc2-rgb8unorm", "etc2-rgb8unorm-srgb", "etc2-rgb8a1unorm", "etc2-rgb8a1unorm-srgb", "etc2-rgba8unorm", "etc2-rgba8unorm-srgb", "eac-r11unorm", "eac-r11snorm", "eac-rg11unorm", "eac-rg11snorm", "astc-4x4-unorm", "astc-4x4-unorm-srgb", "astc-5x4-unorm", "astc-5x4-unorm-srgb", "astc-5x5-unorm", "astc-5x5-unorm-srgb", "astc-6x5-unorm", "astc-6x5-unorm-srgb", "astc-6x6-unorm", "astc-6x6-unorm-srgb", "astc-8x5-unorm", "astc-8x5-unorm-srgb", "astc-8x6-unorm", "astc-8x6-unorm-srgb", "astc-8x8-unorm", "astc-8x8-unorm-srgb", "astc-10x5-unorm", "astc-10x5-unorm-srgb", "astc-10x6-unorm", "astc-10x6-unorm-srgb", "astc-10x8-unorm", "astc-10x8-unorm-srgb", "astc-10x10-unorm", "astc-10x10-unorm-srgb", "astc-12x10-unorm", "astc-12x10-unorm-srgb", "astc-12x12-unorm", "astc-12x12-unorm-srgb"];
const GpuFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_gpu_free(ptr, 1));
const LoaderFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_loader_free(ptr, 1));
const ModelFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_model_free(ptr, 1));

function addToExternrefTable0(obj) {
    const idx = wasm.__externref_table_alloc();
    wasm.__wbindgen_externrefs.set(idx, obj);
    return idx;
}

function _assertClass(instance, klass) {
    if (!(instance instanceof klass)) {
        throw new Error(`expected instance of ${klass.name}`);
    }
}

const CLOSURE_DTORS = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(state => wasm.__wbindgen_destroy_closure(state.a, state.b));

function debugString(val) {
    switch (typeof val) {
        // primitive types
        case 'number':
        case 'boolean':
        case 'undefined':
        return `${val}`;
        case 'string':
        return JSON.stringify(val);
        case 'bigint':
        return `${val}n`;
        case 'symbol':
        return val.description !== undefined
            ? `Symbol(${val.description})`
            : 'Symbol';
        case 'function':
        return typeof val.name === 'string' && val.name !== ''
            ? `Function(${val.name})`
            : 'Function';
        case 'object': {
            if (val === null) {
                return 'null';
            }
            // objects
            if (Array.isArray(val)) {
                return '[' + Array.from(val, debugString).join(', ') + ']';
            }
            // errors
            if (val instanceof Error) {
                return `${val.name}: ${val.message}\n${val.stack}`;
            }

            const toStringOutput = toString.call(val);
            // Test for built-in
            const className = /\[object ([^\]]+)\]/.exec(toStringOutput)?.[1];

            // Failed to match the standard '[object ClassName]'
            if (className === undefined) {
                return toStringOutput;
            }
            if (className === 'Object') {
                // we're a user defined class or Object
                // JSON.stringify avoids problems with cycles, and is generally much
                // easier than looping through ownProperties of `val`.
                try {
                    return 'Object(' + JSON.stringify(val) + ')';
                } catch (_) {
                    return 'Object';
                }
            }
            // TODO we could test for more things here, like `Set`s and `Map`s.
            return className;
        }
        // Per MDN: 'This list of values is exhaustive.'
        // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/typeof#description
    }
}

function getArrayJsValueViewFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    const mem = getDataViewMemory0();
    const result = [];
    for (let i = ptr; i < ptr + 4 * len; i += 4) {
        result.push(wasm.__wbindgen_externrefs.get(mem.getUint32(i, true)));
    }
    return result;
}

function getArrayU32FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint32ArrayMemory0().subarray(ptr / 4, ptr / 4 + len);
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let cachedUint32ArrayMemory0 = null;
function getUint32ArrayMemory0() {
    if (cachedUint32ArrayMemory0 === null || cachedUint32ArrayMemory0.byteLength === 0) {
        cachedUint32ArrayMemory0 = new Uint32Array(wasm.memory.buffer);
    }
    return cachedUint32ArrayMemory0;
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function handleError(f, args) {
    try {
        return f.apply(this, args);
    } catch (e) {
        const idx = addToExternrefTable0(e);
        wasm.__wbindgen_exn_store(idx);
    }
}

function isLikeNone(x) {
    return x === undefined || x === null;
}

function makeMutClosure(arg0, arg1, f) {
    const state = { a: arg0, b: arg1, cnt: 1 };
    const real = (...args) => {

        // First up with a closure we increment the internal reference
        // count. This ensures that the Rust closure environment won't
        // be deallocated while we're invoking it.
        state.cnt++;
        const a = state.a;
        state.a = 0;
        try {
            return f(a, state.b, ...args);
        } finally {
            state.a = a;
            real._wbg_cb_unref();
        }
    };
    real._wbg_cb_unref = () => {
        if (--state.cnt === 0) {
            wasm.__wbindgen_destroy_closure(state.a, state.b);
            state.a = 0;
            CLOSURE_DTORS.unregister(state);
        }
    };
    CLOSURE_DTORS.register(real, state, state);
    return real;
}

function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
        const buf = cachedTextEncoder.encode(arg);
        const ptr = malloc(buf.length, 1) >>> 0;
        getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
        WASM_VECTOR_LEN = buf.length;
        return ptr;
    }

    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;

    const mem = getUint8ArrayMemory0();

    let offset = 0;

    for (; offset < len; offset++) {
        const code = arg.charCodeAt(offset);
        if (code > 0x7F) break;
        mem[ptr + offset] = code;
    }
    if (offset !== len) {
        if (offset !== 0) {
            arg = arg.slice(offset);
        }
        ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
        const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
        const ret = cachedTextEncoder.encodeInto(arg, view);

        offset += ret.written;
        ptr = realloc(ptr, len, offset, 1) >>> 0;
    }

    WASM_VECTOR_LEN = offset;
    return ptr;
}

function takeFromExternrefTable0(idx) {
    const value = wasm.__wbindgen_externrefs.get(idx);
    wasm.__externref_table_dealloc(idx);
    return value;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(bytes) {
    numBytesDecoded += bytes.length;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
        cachedTextDecoder.decode();
        numBytesDecoded = bytes.length;
    }
    return cachedTextDecoder.decode(bytes);
}

const cachedTextEncoder = new TextEncoder();

if (!('encodeInto' in cachedTextEncoder)) {
    cachedTextEncoder.encodeInto = function (arg, view) {
        const buf = cachedTextEncoder.encode(arg);
        view.set(buf);
        return {
            read: arg.length,
            written: buf.length
        };
    };
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasmInstance, wasm;
function __wbg_finalize_init(instance, module) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    wasm.__wbindgen_start();
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (!module.ok) {
            throw new Error(`failed to fetch Wasm: ${module.status} ${module.statusText} fetching '${module.url}'`);
        }

        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

let __wbg_init_promise;
async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;
    if (__wbg_init_promise === undefined) {
        __wbg_init_promise = __wbg_init_once(module_or_path);
        __wbg_init_promise.catch(() => { __wbg_init_promise = undefined; });
    }
    return __wbg_init_promise;
}

async function __wbg_init_once(module_or_path) {

    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('inga_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
