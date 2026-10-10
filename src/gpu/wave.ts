import { CFL_LIMIT, GRID_H, GRID_W, MAX_SOURCES, SPONGE, WaveField, type WaveParams } from '../lib/wave'
import { FULLSCREEN_VS, getGpuDevice } from './device'

export interface WaveBackend {
  kind: 'gpu' | 'cpu'
  step(n: number, p: WaveParams): void
  draw(gain: number, dark: boolean): void
  setWall(wall: Uint8Array): void
  reset(): void
  destroy(): void
}

const MAX_STEPS = 16
const SLOT = 256 // minUniformBufferOffsetAlignment
const UNIFORM_FLOATS = 12 + 4 * MAX_SOURCES
const UNIFORM_BYTES = UNIFORM_FLOATS * 4

const STRUCT = /* wgsl */ `
struct P {
  nx: f32, ny: f32, r2: f32, phase: f32,
  nsrc: f32, lineX: f32, lineY0: f32, lineY1: f32,
  gain: f32, dark: f32, resX: f32, resY: f32,
  src: array<vec4<f32>, ${MAX_SOURCES}>,
};
`

const COMPUTE = /* wgsl */ `
${STRUCT}
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> prev: array<f32>;
@group(0) @binding(2) var<storage, read> cur: array<f32>;
@group(0) @binding(3) var<storage, read_write> next: array<f32>;
@group(0) @binding(4) var<storage, read> wall: array<f32>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let nx = u32(p.nx);
  let ny = u32(p.ny);
  if (id.x >= nx || id.y >= ny) { return; }
  let i = id.y * nx + id.x;
  if (id.x == 0u || id.y == 0u || id.x == nx - 1u || id.y == ny - 1u || wall[i] > 0.5) {
    next[i] = 0.0;
    return;
  }
  let lap = cur[i - 1u] + cur[i + 1u] + cur[i - nx] + cur[i + nx] - 4.0 * cur[i];
  // Quadratic absorbing sponge near the border.
  let d = f32(min(min(id.x, id.y), min(nx - 1u - id.x, ny - 1u - id.y)));
  var s = 0.0;
  if (d < ${SPONGE}.0) {
    let k = (${SPONGE}.0 - d) / ${SPONGE}.0;
    s = 0.25 * k * k;
  }
  var v = (2.0 * cur[i] - (1.0 - s) * prev[i] + p.r2 * lap) / (1.0 + s);
  let drive = sin(p.phase);
  for (var k = 0u; k < u32(p.nsrc); k++) {
    if (id.x == u32(p.src[k].x) && id.y == u32(p.src[k].y)) { v = drive; }
  }
  if (p.lineX > 0.0 && id.x == u32(p.lineX) && f32(id.y) >= p.lineY0 && f32(id.y) <= p.lineY1) { v = drive; }
  next[i] = v;
}
`

const RENDER = /* wgsl */ `
${STRUCT}
@group(0) @binding(0) var<uniform> p: P;
@group(0) @binding(1) var<storage, read> cur: array<f32>;
@group(0) @binding(2) var<storage, read> wall: array<f32>;

${FULLSCREEN_VS}

@fragment
fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  let cx = min(u32(pos.x / p.resX * p.nx), u32(p.nx) - 1u);
  let cy = min(u32(pos.y / p.resY * p.ny), u32(p.ny) - 1u);
  let i = cy * u32(p.nx) + cx;
  let dark = p.dark > 0.5;
  let bg = select(vec3<f32>(0.96, 0.96, 0.98), vec3<f32>(0.06, 0.07, 0.09), dark);
  if (wall[i] > 0.5) {
    return vec4<f32>(select(vec3<f32>(0.35, 0.37, 0.42), vec3<f32>(0.62, 0.65, 0.72), dark), 1.0);
  }
  let v = clamp(cur[i] * p.gain, -1.0, 1.0);
  let warm = vec3<f32>(0.98, 0.55, 0.12);
  let cool = vec3<f32>(0.15, 0.45, 0.98);
  let tint = select(cool, warm, v > 0.0);
  return vec4<f32>(mix(bg, tint, abs(v)), 1.0);
}
`

function packUniform(out: Float32Array, off: number, nx: number, ny: number, p: WaveParams, phase: number, gain: number, dark: boolean, resX: number, resY: number) {
  const r = Math.min(p.courant, CFL_LIMIT)
  out[off + 0] = nx
  out[off + 1] = ny
  out[off + 2] = r * r
  out[off + 3] = phase
  out[off + 4] = Math.min(p.sources.length, MAX_SOURCES)
  out[off + 5] = p.line ? p.line.x : 0
  out[off + 6] = p.line ? p.line.y0 : 0
  out[off + 7] = p.line ? p.line.y1 : 0
  out[off + 8] = gain
  out[off + 9] = dark ? 1 : 0
  out[off + 10] = resX
  out[off + 11] = resY
  for (let k = 0; k < MAX_SOURCES; k++) {
    const s = p.sources[k]
    out[off + 12 + 4 * k] = s ? Math.round(s.x) : -1
    out[off + 13 + 4 * k] = s ? Math.round(s.y) : -1
  }
}

export async function createGpuWave(canvas: HTMLCanvasElement): Promise<WaveBackend | null> {
  const device = await getGpuDevice()
  if (!device) return null
  const ctx = canvas.getContext('webgpu')
  if (!ctx) return null
  const nx = GRID_W
  const ny = GRID_H
  canvas.width = nx * 2
  canvas.height = ny * 2
  const format = navigator.gpu.getPreferredCanvasFormat()
  ctx.configure({ device, format, alphaMode: 'opaque' })

  const bytes = nx * ny * 4
  const state = [0, 1, 2].map(() => device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST }))
  const wallBuf = device.createBuffer({ size: bytes, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
  const stepU = device.createBuffer({ size: SLOT * MAX_STEPS, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  const drawU = device.createBuffer({ size: UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })

  const cLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform', hasDynamicOffset: true, minBindingSize: UNIFORM_BYTES } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
    ],
  })
  const rLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
    ],
  })
  const cPipe = device.createComputePipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [cLayout] }),
    compute: { module: device.createShaderModule({ code: COMPUTE }), entryPoint: 'main' },
  })
  const rModule = device.createShaderModule({ code: RENDER })
  const rPipe = device.createRenderPipeline({
    layout: device.createPipelineLayout({ bindGroupLayouts: [rLayout] }),
    vertex: { module: rModule, entryPoint: 'vs' },
    fragment: { module: rModule, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  })
  const cGroups = [0, 1, 2].map((k) =>
    device.createBindGroup({
      layout: cLayout,
      entries: [
        { binding: 0, resource: { buffer: stepU, size: UNIFORM_BYTES } },
        { binding: 1, resource: { buffer: state[k % 3] } },
        { binding: 2, resource: { buffer: state[(k + 1) % 3] } },
        { binding: 3, resource: { buffer: state[(k + 2) % 3] } },
        { binding: 4, resource: { buffer: wallBuf } },
      ],
    }),
  )
  const rGroups = [0, 1, 2].map((k) =>
    device.createBindGroup({
      layout: rLayout,
      entries: [
        { binding: 0, resource: { buffer: drawU } },
        { binding: 1, resource: { buffer: state[(k + 1) % 3] } },
        { binding: 2, resource: { buffer: wallBuf } },
      ],
    }),
  )

  let k = 0
  let phase = 0
  const staging = new Float32Array((SLOT * MAX_STEPS) / 4)
  const drawStaging = new Float32Array(UNIFORM_FLOATS)
  let last: WaveParams = { courant: 0.5, freq: 0.03, sources: [], line: null }
  const wx = Math.ceil(nx / 8)
  const wy = Math.ceil(ny / 8)

  return {
    kind: 'gpu',
    step(n, p) {
      last = p
      const count = Math.min(n, MAX_STEPS)
      const enc = device.createCommandEncoder()
      for (let j = 0; j < count; j++) {
        packUniform(staging, (j * SLOT) / 4, nx, ny, p, phase, 1, false, 1, 1)
        phase = (phase + 2 * Math.PI * p.freq) % (2 * Math.PI)
      }
      device.queue.writeBuffer(stepU, 0, staging.buffer, 0, count * SLOT)
      for (let j = 0; j < count; j++) {
        const pass = enc.beginComputePass()
        pass.setPipeline(cPipe)
        pass.setBindGroup(0, cGroups[k % 3], [j * SLOT])
        pass.dispatchWorkgroups(wx, wy)
        pass.end()
        k++
      }
      device.queue.submit([enc.finish()])
    },
    draw(gain, dark) {
      packUniform(drawStaging, 0, nx, ny, last, phase, gain, dark, canvas.width, canvas.height)
      device.queue.writeBuffer(drawU, 0, drawStaging)
      const enc = device.createCommandEncoder()
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      })
      pass.setPipeline(rPipe)
      pass.setBindGroup(0, rGroups[k % 3])
      pass.draw(3)
      pass.end()
      device.queue.submit([enc.finish()])
    },
    setWall(wall) {
      const f = new Float32Array(wall.length)
      for (let i = 0; i < wall.length; i++) f[i] = wall[i]
      device.queue.writeBuffer(wallBuf, 0, f)
    },
    reset() {
      const z = new Float32Array(nx * ny)
      for (const b of state) device.queue.writeBuffer(b, 0, z)
      phase = 0
    },
    destroy() {
      for (const b of [...state, wallBuf, stepU, drawU]) b.destroy()
    },
  }
}

export function createCpuWave(canvas: HTMLCanvasElement): WaveBackend {
  const f = new WaveField(GRID_W, GRID_H)
  canvas.width = GRID_W
  canvas.height = GRID_H
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(GRID_W, GRID_H)
  return {
    kind: 'cpu',
    step(n, p) {
      for (let i = 0; i < n; i++) f.step(p)
    },
    draw(gain, dark) {
      const bg = dark ? [15, 18, 23] : [245, 245, 250]
      const wallC = dark ? [158, 166, 184] : [89, 94, 107]
      const d = img.data
      for (let i = 0; i < f.cur.length; i++) {
        const o = i * 4
        if (f.wall[i]) {
          d[o] = wallC[0]
          d[o + 1] = wallC[1]
          d[o + 2] = wallC[2]
        } else {
          const v = Math.max(-1, Math.min(1, f.cur[i] * gain))
          const a = Math.abs(v)
          const t = v > 0 ? [250, 140, 31] : [38, 115, 250]
          d[o] = bg[0] + (t[0] - bg[0]) * a
          d[o + 1] = bg[1] + (t[1] - bg[1]) * a
          d[o + 2] = bg[2] + (t[2] - bg[2]) * a
        }
        d[o + 3] = 255
      }
      ctx.putImageData(img, 0, 0)
    },
    setWall(wall) {
      f.wall.set(wall)
    },
    reset() {
      f.reset()
    },
    destroy() {},
  }
}
