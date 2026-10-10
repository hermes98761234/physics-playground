/** Shared WebGPU device. Resolves to null where WebGPU is missing (old browsers, headless Chrome without a GPU). */
let cached: Promise<GPUDevice | null> | null = null

export function getGpuDevice(): Promise<GPUDevice | null> {
  cached ??= (async () => {
    try {
      if (!('gpu' in navigator) || !navigator.gpu) return null
      const adapter = await navigator.gpu.requestAdapter()
      if (!adapter) return null
      return await adapter.requestDevice()
    } catch {
      return null
    }
  })()
  return cached
}

export const hasWebGpuApi = () => typeof navigator !== 'undefined' && 'gpu' in navigator && !!navigator.gpu

/** Fullscreen-triangle vertex shader shared by the render pipelines. */
export const FULLSCREEN_VS = /* wgsl */ `
@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
  let p = array<vec2<f32>, 3>(vec2<f32>(-1.0, -1.0), vec2<f32>(3.0, -1.0), vec2<f32>(-1.0, 3.0));
  return vec4<f32>(p[i], 0.0, 1.0);
}
`
