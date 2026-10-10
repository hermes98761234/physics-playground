import { createContext, useContext, useEffect, useRef } from 'react'
import { tr, type T } from './i18n'

export interface Ctx {
  t: T
  dark: boolean
}

export const AppCtx = createContext<Ctx>({ t: (s, ...a) => tr('en', s, ...a), dark: false })
export const useT = () => useContext(AppCtx).t
export const useDark = () => useContext(AppCtx).dark

/** Calls `cb(dtSeconds)` every animation frame while `running`. */
export function useFrame(cb: (dt: number) => void, running = true) {
  const ref = useRef(cb)
  useEffect(() => {
    ref.current = cb
  })
  useEffect(() => {
    if (!running) return
    let raf = 0
    let last = performance.now()
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000)
      last = now
      ref.current(dt)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [running])
}
