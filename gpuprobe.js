// Inga -- Local LLM inference engine in Rust.
// Copyright (c) Matteo Baccan -- https://github.com/matteobaccan/inga
// SPDX-License-Identifier: MIT

// How much GPU memory this tab can use at full speed, measured (WebGPU tells no GPU's
// memory). A WebGPU buffer past what the card holds does not fail on Windows: D3D12 and
// WDDM keep what does not fit in system memory, read over PCIe at a sixth of the card's
// speed or less (a GTX 1050 of 2 GB given 3 GB of Llama 3.2 3B Q8_0 decoded at 2.7
// tok/s; a Quadro P1000 given 3.5 GB of it read its weights at 21 GB/s instead of 54).
// So the probe allocates buffers of 64 MiB and writes each; every 256 MiB it reads all
// of them in one submission (all must be in the card's memory at once, as a model's
// step needs them: a buffer read alone is always brought in, pushing older ones out)
// and times it. The added 256 MiB cost what they would at the first reads' speed while
// they fit; twice in a row at under a third of it, the card's memory has ended, and
// what came before, less a margin, is what the GPU holds. Buffers of 64 MiB, not
// larger: in Chrome on D3D12 a P1000 put every 256 MiB buffer after the third in
// system memory with 2 GiB still free (.github/workflows/gpu.yml, suite webgpu,
// probeonly). A time cap stops it early (the result is then "at least").
// The probe runs on a device of its own, destroyed at the end (its memory goes back at
// once), before the model's device opens. The page keeps the result per adapter
// (app.js, GPU memory Auto); a value in MB set by hand wins.

const MIB = 1 << 20;
// Buffers read together between two measures.
const EVERY = 4;

const WGSL = `
@group(0) @binding(0) var<storage, read> src: array<vec4<u32>>;
@group(0) @binding(1) var<storage, read_write> out: array<u32>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) g: vec3<u32>, @builtin(num_workgroups) n: vec3<u32>) {
  var acc = vec4<u32>(0u);
  let len = arrayLength(&src);
  let stride = n.x * 256u;
  for (var i = g.x; i < len; i += stride) {
    acc ^= src[i];
  }
  // Never true for the pattern written: the reads stay, the write does not happen.
  if (all(acc == vec4<u32>(0x9e3779b9u))) {
    out[0] = acc.x;
  }
}`;

// Writes every word of a new buffer (its first use: the driver places it then).
const FILL = `
@group(0) @binding(0) var<storage, read_write> dst: array<vec4<u32>>;
@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) g: vec3<u32>, @builtin(num_workgroups) n: vec3<u32>) {
  let len = arrayLength(&dst);
  let stride = n.x * 256u;
  for (var i = g.x; i < len; i += stride) {
    dst[i] = vec4<u32>(i, i ^ 0x55555555u, i * 3u, ~i);
  }
}`;

// The key of an adapter in the page's cache: what it tells of itself and its largest
// buffer.
export function adapterKey(adapter) {
  const i = adapter?.info ?? {};
  return [i.vendor, i.architecture, i.device, i.description, adapter?.limits?.maxBufferSize].map((x) => x ?? "").join("|");
}

// Measures the adapter's usable memory. Options: `stepMiB` (64, the buffers' size),
// `maxMiB` (the most tried, 16384), `capMs` (3000), `margin` (MiB taken off the last
// full-speed total, 128), `adapter` (else the high-performance one), `past` (measures
// after the fall, for a report of what happens there: 0); for the measurements,
// `usage: "copy"` and `init: "write"` (buffers made and filled as the model's weights
// are). Resolves to { usable (bytes), measured (whether the speed fell: else a lower
// bound), steps: [{ mib, gbs (the read of all, GB/s), ms, add (the added bytes' GB/s) }],
// key, ms, why, step, timer }.
export async function probeGpuMemory(opts = {}) {
  const t0 = performance.now();
  const adapter = opts.adapter ?? (await navigator.gpu?.requestAdapter({ powerPreference: "high-performance" }));
  if (!adapter) throw new Error("no WebGPU adapter");
  const key = adapterKey(adapter);
  const lim = adapter.limits;
  const step = Math.floor(Math.min((opts.stepMiB ?? 64) * MIB, lim.maxStorageBufferBindingSize, lim.maxBufferSize) / 16) * 16;
  const maxBytes = (opts.maxMiB ?? 16384) * MIB;
  const capMs = opts.capMs ?? 3000;
  const margin = (opts.margin ?? 128) * MIB;
  // timestamp-query where the adapter has it: the read's GPU time, not the round trip.
  const stamps = adapter.features.has("timestamp-query");
  const device = await adapter.requestDevice({
    requiredFeatures: stamps ? ["timestamp-query"] : [],
    requiredLimits: { maxBufferSize: lim.maxBufferSize, maxStorageBufferBindingSize: lim.maxStorageBufferBindingSize },
  });
  const out = device.createBuffer({ size: 16, usage: GPUBufferUsage.STORAGE });
  const pipeline = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: WGSL }), entryPoint: "main" } });
  const fill = device.createComputePipeline({ layout: "auto", compute: { module: device.createShaderModule({ code: FILL }), entryPoint: "main" } });
  const qs = stamps ? device.createQuerySet({ type: "timestamp", count: 2 }) : null;
  const resolved = stamps ? device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC }) : null;
  const readback = stamps ? device.createBuffer({ size: 16, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST }) : null;
  const buffers = [];
  const groups = [];
  const steps = [];
  let why = "the time cap";
  let fell = false;
  let fellAt = 0;
  let past = opts.past ?? 0;
  // Reads every buffer so far once; resolves to the milliseconds it took (the GPU's,
  // with timestamps).
  const readAll = async (only = groups, times = 1) => {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass(qs ? { timestampWrites: { querySet: qs, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } } : {});
    pass.setPipeline(pipeline);
    for (let k = 0; k < times; k++) {
      for (const g of only) {
        pass.setBindGroup(0, g);
        pass.dispatchWorkgroups(1024);
      }
    }
    pass.end();
    if (qs) {
      enc.resolveQuerySet(qs, 0, 2, resolved, 0);
      enc.copyBufferToBuffer(resolved, 0, readback, 0, 16);
    }
    const t = performance.now();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
    const wall = performance.now() - t;
    if (!qs) return wall;
    await readback.mapAsync(GPUMapMode.READ);
    const [a, b] = new BigUint64Array(readback.getMappedRange());
    readback.unmap();
    return b > a ? Number(b - a) / 1e6 : wall;
  };
  // Writes a new buffer whole: by a kernel, or (`init: "write"`) by the queue, as the
  // model's weights are.
  const zeros = opts.init === "write" ? new Uint8Array(16 * MIB) : null;
  const write = async (buf) => {
    if (zeros) {
      for (let at = 0; at < buf.size; at += zeros.length) device.queue.writeBuffer(buf, at, zeros, 0, Math.min(zeros.length, buf.size - at));
      await device.queue.onSubmittedWorkDone();
      return;
    }
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(fill);
    pass.setBindGroup(0, device.createBindGroup({ layout: fill.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buf } }] }));
    pass.dispatchWorkgroups(1024);
    pass.end();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
  };
  try {
    while ((buffers.length + 1) * step <= maxBytes) {
      if (performance.now() - t0 > capMs) break;
      device.pushErrorScope("out-of-memory");
      device.pushErrorScope("validation");
      // `usage: "copy"`: the usage of the model's buffers (storage, copies).
      const usage = GPUBufferUsage.STORAGE | (opts.usage === "copy" ? GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST : 0);
      const buf = device.createBuffer({ size: step, usage });
      const bad = (await device.popErrorScope()) ?? (await device.popErrorScope());
      if (bad) {
        buf.destroy();
        why = `a buffer refused (${bad.message})`;
        break;
      }
      buffers.push(buf);
      groups.push(device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buf } }, { binding: 1, resource: { buffer: out } }] }));
      // Written first (its first use); every EVERY buffers, all read together.
      await write(buf);
      if (buffers.length % EVERY) continue;
      const ms = await readAll();
      const bytes = buffers.length * step;
      const prev = steps[steps.length - 1];
      const add = prev ? (bytes - prev.mib * MIB) / 1e9 / ((ms - prev.ms) / 1e3) : bytes / 1e9 / (ms / 1e3);
      steps.push({ mib: bytes / MIB, gbs: bytes / 1e9 / (ms / 1e3), ms, add: add > 0 && Number.isFinite(add) ? add : 999 });
      // The reference: the best of the first three reads of all.
      const ref = Math.max(...steps.slice(0, 3).map((x) => x.gbs));
      const slow = (i) => i >= 3 && steps[i].add < ref / 3;
      const n = steps.length - 1;
      if (fell) {
        if (past-- <= 0) break;
      } else if (slow(n) && slow(n - 1)) {
        fell = true;
        fellAt = n - 1;
        why = `the 256 MiB added from ${steps[n - 2].mib} MiB read at ${steps[n - 1].add.toFixed(1)} GB/s, then ${steps[n].add.toFixed(1)} (the first reads ${ref.toFixed(1)})`;
        if (past-- <= 0) break;
      }
    }
    if (!fell && buffers.length * step + step > maxBytes) why = `the most tried (${maxBytes / MIB} MiB)`;
  } finally {
    for (const b of buffers) b.destroy();
    out.destroy();
    qs?.destroy();
    resolved?.destroy();
    readback?.destroy();
    device.destroy();
  }
  // Fallen: what was allocated before the first slow measure, less the margin.
  const good = fell ? steps[fellAt - 1].mib * MIB : (steps[steps.length - 1]?.mib ?? 0) * MIB;
  return { usable: Math.max(0, good - (fell ? margin : 0)), measured: fell, steps, key, ms: performance.now() - t0, why, step, timer: stamps ? "timestamps" : "round trip" };
}
