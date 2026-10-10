import { fieldAt, potentialAt, potentialToRgb, SOFT, type Charge } from '../lib/electro'
import { FULLSCREEN_VS, getGpuDevice } from './device'

export const FIELD_W = 800
export const FIELD_H = 500
export const MAX_CHARGES = 16

export interface FieldBackend {
  kind: 'gpu' | 'cpu'
  draw(charges: Charge[], dark: boolean): void
  destroy(): void
}

const SHADER = /* wgsl */ `
struct U {
  n: f32, w: f32, h: f32, dark: f32,
  q: array<vec4<f32>, ${MAX_CHARGES}>,
};
@group(0) @binding(0) var<uniform> u: U;

${FULLSCREEN_VS}

@fragment
fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
  // World coordinates (the canvas is exactly w x h pixels scaled by a constant factor).
  let x = pos.x;
  let y = pos.y;
  var v = 0.0;
  var e = vec2<f32>(0.0, 0.0);
  for (var i = 0u; i < u32(u.n); i++) {
    let d = vec2<f32>(x, y) - u.q[i].xy;
    let r2 = dot(d, d) + ${SOFT * SOFT}.0;
    v += u.q[i].z / sqrt(r2);
    e += u.q[i].z * d / (r2 * sqrt(r2));
  }
  let s = tanh(v * 8.0);
  let dark = u.dark > 0.5;
  let base = select(vec3<f32>(250.0, 250.0, 252.0), vec3<f32>(18.0, 20.0, 26.0), dark) / 255.0;
  let tint = select(vec3<f32>(59.0, 130.0, 246.0), vec3<f32>(239.0, 68.0, 68.0), s >= 0.0) / 255.0;
  var col = mix(base, tint, abs(s) * 0.9);
  // Thin equipotential lines, about one pixel wide wherever the field strength is.
  let f = abs(fract(v * 24.0) - 0.5);
  let distPx = (0.5 - f) / (24.0 * max(length(e), 1e-9));
  let line = clamp(1.0 - distPx, 0.0, 1.0) * 0.35;
  col = mix(col, select(vec3<f32>(0.0), vec3<f32>(1.0), dark), line);
  return vec4<f32>(col, 1.0);
}
`

export async function createGpuField(canvas: HTMLCanvasElement): Promise<FieldBackend | null> {
  const device = await getGpuDevice()
  if (!device) return null
  const ctx = canvas.getContext('webgpu')
  if (!ctx) return null
  canvas.width = FIELD_W
  canvas.height = FIELD_H
  const format = navigator.gpu.getPreferredCanvasFormat()
  ctx.configure({ device, format, alphaMode: 'opaque' })
  const module = device.createShaderModule({ code: SHADER })
  const pipe = device.createRenderPipeline({
    layout: 'auto',
    vertex: { module, entryPoint: 'vs' },
    fragment: { module, entryPoint: 'fs', targets: [{ format }] },
  })
  const buf = device.createBuffer({ size: (4 + 4 * MAX_CHARGES) * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  const group = device.createBindGroup({ layout: pipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: buf } }] })
  const data = new Float32Array(4 + 4 * MAX_CHARGES)
  return {
    kind: 'gpu',
    draw(charges, dark) {
      data.fill(0)
      const n = Math.min(charges.length, MAX_CHARGES)
      data.set([n, FIELD_W, FIELD_H, dark ? 1 : 0], 0)
      for (let i = 0; i < n; i++) data.set([charges[i].x, charges[i].y, charges[i].q, 0], 4 + 4 * i)
      device.queue.writeBuffer(buf, 0, data)
      const enc = device.createCommandEncoder()
      const pass = enc.beginRenderPass({
        colorAttachments: [{ view: ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 1 } }],
      })
      pass.setPipeline(pipe)
      pass.setBindGroup(0, group)
      pass.draw(3)
      pass.end()
      device.queue.submit([enc.finish()])
    },
    destroy() {
      buf.destroy()
    },
  }
}

/** CPU fallback: evaluates the same potential map at half resolution and lets CSS scale it up. */
export function createCpuField(canvas: HTMLCanvasElement): FieldBackend {
  const sc = 2
  const w = FIELD_W / sc
  const h = FIELD_H / sc
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(w, h)
  return {
    kind: 'cpu',
    draw(charges, dark) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const wx = (x + 0.5) * sc
          const wy = (y + 0.5) * sc
          const e = fieldAt(charges, wx, wy)
          const [r, g, b] = potentialToRgb(potentialAt(charges, wx, wy), dark, Math.hypot(e.ex, e.ey) * sc)
          const o = (y * w + x) * 4
          img.data[o] = r
          img.data[o + 1] = g
          img.data[o + 2] = b
          img.data[o + 3] = 255
        }
      }
      ctx.putImageData(img, 0, 0)
    },
    destroy() {},
  }
}
