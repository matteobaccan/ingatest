/**
 * A GGUF model being received in chunks (`Uint8Array`s, in file order): each byte is
 * copied once, from the chunk straight into its tensor's buffer.
 */
export class Loader {
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
 * Runs the engine's worker threads' loops on the calling Web Worker, which must have
 * instantiated this module on the memory of the one that loads the model: never
 * returns (threaded module only). See `inga_cpu::web_threads`.
 */
export function runWorker() {
    wasm.runWorker();
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
 * The compiled module and its shared memory, which the page hands to each Web Worker
 * it starts for [`run_worker`] (threaded module only).
 * @returns {Array<any>}
 */
export function threadInit() {
    const ret = wasm.threadInit();
    return ret;
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
function __wbg_get_imports(memory) {
    const import0 = {
        __proto__: null,
        __wbg_Error_208446807d0d1e30: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
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
        __wbg___wbindgen_is_undefined_be5b34249ff1fc15: function(arg0) {
            const ret = arg0 === undefined;
            return ret;
        },
        __wbg___wbindgen_memory_17a1178bc3328ea3: function() {
            const ret = wasm.memory;
            return ret;
        },
        __wbg___wbindgen_module_2e98e71e8e96b4ac: function() {
            const ret = wasmModule;
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
        __wbg_call_fc92fee6137d452d: function() { return handleError(function (arg0, arg1, arg2, arg3) {
            const ret = arg0.call(arg1, arg2, arg3);
            return ret;
        }, arguments); },
        __wbg_error_a586564d395dfdcb: function(arg0, arg1) {
            console.error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_get_2080c49015e35254: function() { return handleError(function (arg0, arg1) {
            const ret = Reflect.get(arg0, arg1);
            return ret;
        }, arguments); },
        __wbg_length_186163212ffe79c3: function(arg0) {
            const ret = arg0.length;
            return ret;
        },
        __wbg_new_787b9fb330d55d78: function(arg0, arg1) {
            const ret = new Error(getStringFromWasm0(arg0, arg1));
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
        __wbg_of_e7ea0fcd535c1444: function(arg0, arg1) {
            const ret = Array.of(arg0, arg1);
            return ret;
        },
        __wbg_performance_7e4e4494fdc9d07a: function(arg0) {
            const ret = arg0.performance;
            return ret;
        },
        __wbg_prototypesetcall_13162965d1fe7aa3: function(arg0, arg1, arg2) {
            Uint8Array.prototype.set.call(getArrayU8FromWasm0(arg0, arg1), arg2);
        },
        __wbg_resolve_dbf78ab4942478b0: function(arg0) {
            const ret = Promise.resolve(arg0);
            return ret;
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
        __wbg_timeOrigin_753cb14441f98ada: function(arg0) {
            const ret = arg0.timeOrigin;
            return ret;
        },
        __wbindgen_generic_0000000000000001: function(arg0) {
            // Cast intrinsic for `F64 -> Externref`.
            const ret = arg0;
            return ret;
        },
        __wbindgen_generic_0000000000000002: function(arg0, arg1) {
            // Cast intrinsic for `Ref(Slice(U8)) -> NamedExternref("Uint8Array")`.
            const ret = getArrayU8FromWasm0(arg0, arg1);
            return ret;
        },
        __wbindgen_generic_0000000000000003: function(arg0, arg1) {
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
        memory: memory || new WebAssembly.Memory({initial:27,maximum:65536,shared:true}),
    };
    return {
        __proto__: null,
        "./inga_wasm_bg.js": import0,
    };
}

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

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer !== wasm.memory.buffer) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.buffer !== wasm.memory.buffer) {
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

let cachedTextDecoder = (typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8', { ignoreBOM: true }) : undefined);
if (cachedTextDecoder) cachedTextDecoder.decode();

const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(bytes) {
    numBytesDecoded += bytes.length;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true });
        cachedTextDecoder.decode();
        numBytesDecoded = bytes.length;
    }
    return cachedTextDecoder.decode(bytes.slice());
}

const cachedTextEncoder = (typeof TextEncoder !== 'undefined' ? new TextEncoder() : undefined);

if (cachedTextEncoder) {
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
function __wbg_finalize_init(instance, module, thread_stack_size) {
    wasmInstance = instance;
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    if (typeof thread_stack_size !== 'undefined' && (typeof thread_stack_size !== 'number' || thread_stack_size === 0 || thread_stack_size % 65536 !== 0)) {
        throw new Error('invalid stack size');
    }

    wasm.__wbindgen_start(thread_stack_size);
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

function initSync(module, memory) {
    if (wasm !== undefined) return wasm;

    let thread_stack_size
    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module, memory, thread_stack_size} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports(memory);
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module, thread_stack_size);
}

let __wbg_init_promise;
async function __wbg_init(module_or_path, memory) {
    if (wasm !== undefined) return wasm;
    if (__wbg_init_promise === undefined) {
        __wbg_init_promise = __wbg_init_once(module_or_path, memory);
        __wbg_init_promise.catch(() => { __wbg_init_promise = undefined; });
    }
    return __wbg_init_promise;
}

async function __wbg_init_once(module_or_path, memory) {
    let thread_stack_size
    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path, memory, thread_stack_size} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('inga_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports(memory);

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module, thread_stack_size);
}

export { initSync, __wbg_init as default };
