import { useEffect, useRef, useState } from 'react'
import { Layout, Panel, Seg, Slider } from '../components'
import { useDark, useFrame, useT } from '../ctx'
import { advance, rlcDamping, timeWindow, voltages, type CircuitKind, type CircuitParams, type CircuitState } from '../lib/circuit'
import { formatEng } from '../lib/units'

interface Sample {
  t: number
  v: number
  vR: number
  vC: number
  vL: number
  i: number
}

const DW = 800
const DH = 250
const PW = 800
const PH = 440
const SAMPLES_PER_WINDOW = 700

const log = (v: number) => Math.log10(v)
const round3 = (v: number) => Number(v.toPrecision(3))

export default function CircuitSim() {
  const t = useT()
  const dark = useDark()
  const diagram = useRef<HTMLCanvasElement>(null)
  const plot = useRef<HTMLCanvasElement>(null)
  const [kind, setKind] = useState<CircuitKind>('RLC')
  const [V, setV] = useState(10)
  const [R, setR] = useState(20)
  const [L, setL] = useState(0.01)
  const [C, setC] = useState(1e-5)
  const [on, setOn] = useState(true)
  const [speed, setSpeed] = useState(1)
  const [paused, setPaused] = useState(false)
  const params: CircuitParams = { kind, V, R, L, C }
  const sim = useRef({ s: { q: 0, i: 0 } as CircuitState, time: 0, acc: 0, samples: [] as Sample[], phase: 0 })
  const live = useRef({ params, on, speed, paused, dark })
  useEffect(() => {
    live.current = { params, on, speed, paused, dark }
  })

  // Changing the circuit restarts from rest (otherwise q/C or L·i would jump).
  useEffect(() => {
    sim.current = { s: { q: 0, i: 0 }, time: 0, acc: 0, samples: [], phase: 0 }
  }, [kind, V, R, L, C])

  const win = timeWindow(params)
  const damping = kind === 'RLC' ? rlcDamping(R, L, C) : null
  const tau = kind === 'RC' ? R * C : kind === 'RL' ? L / R : null

  useFrame((dt) => {
    const { params: p, on: sw, speed: sp, paused: pa, dark: dk } = live.current
    const st = sim.current
    const w = timeWindow(p)
    const v = sw ? p.V : 0
    if (!pa) {
      st.acc += (dt * w * sp) / 8
      const h = w / SAMPLES_PER_WINDOW
      let guard = 0
      while (st.acc >= h && guard++ < 400) {
        st.s = advance(p, st.s, v, h)
        st.time += h
        st.acc -= h
        const vo = voltages(p, st.s, v)
        st.samples.push({ t: st.time, v, ...vo, i: st.s.i })
        const cut = st.time - w * 1.02
        while (st.samples.length > 2 && st.samples[0].t < cut) st.samples.shift()
      }
      st.phase += (st.s.i / (p.V / p.R || 1)) * dt * 140
    }
    drawDiagram(diagram.current!, p, sw, st.phase, dk, st.s.i)
    drawPlot(plot.current!, p, st.samples, w, st.time, dk, t)
  })

  return (
    <Layout
      controls={
        <>
          <Panel title="Circuit">
            <Seg
              value={kind}
              onChange={setKind}
              options={[
                { value: 'RC', label: 'RC' },
                { value: 'RL', label: 'RL' },
                { value: 'RLC', label: 'RLC' },
              ]}
            />
            <Slider label="Source voltage" value={V} min={1} max={24} step={1} onChange={setV} format={(v) => formatEng(v, 'V')} />
            <Slider label="Resistance R" value={log(R)} min={0} max={4} step={0.02} onChange={(v) => setR(round3(10 ** v))} format={() => formatEng(R, 'Ω')} />
            {kind !== 'RC' && <Slider label="Inductance L" value={log(L)} min={-3} max={0} step={0.02} onChange={(v) => setL(round3(10 ** v))} format={() => formatEng(L, 'H')} />}
            {kind !== 'RL' && <Slider label="Capacitance C" value={log(C)} min={-7} max={-3} step={0.02} onChange={(v) => setC(round3(10 ** v))} format={() => formatEng(C, 'F')} />}
          </Panel>
          <Panel title="Switch">
            <Seg
              value={on ? 'on' : 'off'}
              onChange={(v) => setOn(v === 'on')}
              options={[
                { value: 'on', label: 'Connect source' },
                { value: 'off', label: 'Short the loop' },
              ]}
            />
            <Slider label="Playback speed" value={speed} min={0.1} max={3} step={0.1} onChange={setSpeed} format={(v) => `${v.toFixed(1)}×`} />
            <div className="row">
              <button onClick={() => setPaused(!paused)}>{paused ? t('Run') : t('Pause')}</button>
              <button onClick={() => (sim.current = { s: { q: 0, i: 0 }, time: 0, acc: 0, samples: [], phase: 0 })}>{t('Restart')}</button>
            </div>
          </Panel>
          <Panel title="Numbers">
            {tau !== null && (
              <p className="hint mono">
                τ = {kind === 'RC' ? 'R·C' : 'L/R'} = {formatEng(tau, 's')}
              </p>
            )}
            {damping && (
              <p className="hint mono">
                α = R/2L = {damping.alpha.toFixed(0)} s⁻¹ · ω₀ = 1/√LC = {damping.omega0.toFixed(0)} rad/s
                <br />
                {damping.regime === 'under' ? t('Underdamped: rings at the damped frequency') : damping.regime === 'over' ? t('Overdamped: no oscillation') : t('Critically damped')}
              </p>
            )}
            <p className="hint mono">{t('Time shown')}: {formatEng(win, 's')}</p>
          </Panel>
        </>
      }
      explain={
        <>
          <h3>{t('What you are seeing')}</h3>
          <p>{t('A DC source drives a series loop through a switch. The state (capacitor charge and loop current) is advanced by a fourth-order Runge-Kutta solver; the test-suite checks it against the exact RC, RL and RLC step responses. The moving dots show the current: faster means more current, and they reverse if it reverses.')}</p>
          <p>{t('Flip the switch to short the source and watch the stored energy drain through the resistor. In an RLC loop a small R rings (underdamped), a large R creeps (overdamped), and R = 2√(L/C) is the critically damped boundary.')}</p>
        </>
      }
    >
      <canvas ref={diagram} width={DW} height={DH} className="sim-canvas" style={{ aspectRatio: `${DW} / ${DH}` }} role="img" aria-label={t('Circuit diagram with animated current')} />
      <canvas ref={plot} width={PW} height={PH} className="sim-canvas" style={{ aspectRatio: `${PW} / ${PH}` }} role="img" aria-label={t('Voltage and current over time')} />
    </Layout>
  )
}

const COLORS = { R: '#f59e0b', C: '#3b82f6', L: '#22c55e', V: '#9ca3af', I: '#ef4444' }

function palette(dark: boolean) {
  return dark
    ? { bg: '#0b0d11', fg: '#e6e8ec', muted: '#9aa1ad', grid: '#1f242d', wire: '#c7ccd6' }
    : { bg: '#ffffff', fg: '#1d2129', muted: '#5f6673', grid: '#e3e6ea', wire: '#3d4452' }
}

function drawDiagram(c: HTMLCanvasElement, p: CircuitParams, on: boolean, phase: number, dark: boolean, current: number) {
  const ctx = c.getContext('2d')!
  const pal = palette(dark)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, DW, DH)
  const x0 = 110
  const x1 = 700
  const yT = 60
  const yB = 200
  const yMid = (yT + yB) / 2
  const bypass = 50
  // Loop path in the direction of positive current.
  const path: [number, number][] = on
    ? [[x0, yB], [x0, yT], [x1, yT], [x1, yB], [x0, yB]]
    : [[x0, yB], [bypass, yB], [bypass, yT], [x0, yT], [x1, yT], [x1, yB], [x0, yB]]

  const boxes: { x: number; y: number; w: number; h: number }[] = []
  const rTop = { x: 330, y: yT - 16, w: 110, h: 32 }
  boxes.push(rTop)
  boxes.push({ x: x0 - 22, y: yMid - 36, w: 44, h: 72 })
  const right = { x: x1 - 24, y: yMid - 36, w: 48, h: 72 }
  const bottom = { x: 330, y: yB - 16, w: 110, h: 32 }
  boxes.push(right)
  if (p.kind === 'RLC') boxes.push(bottom)

  // wires
  ctx.strokeStyle = pal.wire
  ctx.lineWidth = 3
  ctx.lineJoin = 'round'
  ctx.beginPath()
  path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
  ctx.stroke()
  if (on) {
    ctx.setLineDash([5, 6])
    ctx.strokeStyle = pal.muted
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(x0, yB)
    ctx.lineTo(bypass, yB)
    ctx.lineTo(bypass, yT)
    ctx.lineTo(x0, yT)
    ctx.stroke()
    ctx.setLineDash([])
  }
  // cover wires under components
  ctx.fillStyle = pal.bg
  for (const b of boxes) ctx.fillRect(b.x, b.y, b.w, b.h)

  // battery
  ctx.strokeStyle = on ? pal.fg : pal.muted
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x0 - 20, yMid - 8)
  ctx.lineTo(x0 + 20, yMid - 8)
  ctx.moveTo(x0 - 11, yMid + 8)
  ctx.lineTo(x0 + 11, yMid + 8)
  ctx.stroke()
  ctx.fillStyle = on ? pal.fg : pal.muted
  ctx.font = '14px system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(`${p.V} V`, x0 + 26, yMid + 5)
  ctx.fillText('+', x0 + 24, yMid - 14)

  // resistor (zigzag)
  ctx.strokeStyle = COLORS.R
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(rTop.x, yT)
  for (let i = 0; i < 6; i++) ctx.lineTo(rTop.x + 10 + i * 18, yT + (i % 2 ? 14 : -14))
  ctx.lineTo(rTop.x + rTop.w, yT)
  ctx.stroke()
  ctx.fillStyle = COLORS.R
  ctx.textAlign = 'center'
  ctx.fillText(`R = ${formatEng(p.R, 'Ω')}`, rTop.x + rTop.w / 2, yT - 26)

  const drawL = (cx: number, cy: number, vertical: boolean) => {
    ctx.strokeStyle = COLORS.L
    ctx.lineWidth = 3
    ctx.beginPath()
    const n = 4
    const len = vertical ? 72 : 110
    const r = len / n / 2
    for (let i = 0; i < n; i++) {
      if (vertical) ctx.arc(cx, cy - len / 2 + r + i * 2 * r, r, -Math.PI / 2, Math.PI / 2)
      else ctx.arc(cx - len / 2 + r + i * 2 * r, cy, r, Math.PI, 0)
    }
    ctx.stroke()
    ctx.fillStyle = COLORS.L
    ctx.textAlign = vertical ? 'left' : 'center'
    ctx.fillText(`L = ${formatEng(p.L, 'H')}`, vertical ? cx + 34 : cx, vertical ? cy + 4 : cy + 34)
  }
  const drawC = (cx: number, cy: number) => {
    ctx.strokeStyle = COLORS.C
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.moveTo(cx - 22, cy - 7)
    ctx.lineTo(cx + 22, cy - 7)
    ctx.moveTo(cx - 22, cy + 7)
    ctx.lineTo(cx + 22, cy + 7)
    ctx.moveTo(cx, yT)
    ctx.lineTo(cx, cy - 7)
    ctx.moveTo(cx, cy + 7)
    ctx.lineTo(cx, yB)
    ctx.stroke()
    ctx.fillStyle = COLORS.C
    ctx.textAlign = 'right'
    ctx.fillText(`C = ${formatEng(p.C, 'F')}`, cx - 30, cy + 4)
  }
  if (p.kind === 'RC') drawC(x1, yMid)
  else if (p.kind === 'RL') drawL(x1, yMid, true)
  else {
    drawC(x1, yMid)
    drawL(385, yB, false)
  }

  // current dots
  let total = 0
  const segs: { len: number; x: number; y: number; dx: number; dy: number }[] = []
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, ay] = path[i]
    const [bx, by] = path[i + 1]
    const len = Math.hypot(bx - ax, by - ay)
    if (len > 0) {
      segs.push({ len, x: ax, y: ay, dx: (bx - ax) / len, dy: (by - ay) / len })
      total += len
    }
  }
  const spacing = 28
  const amp = Math.min(1, Math.abs(current) / ((p.V / p.R) * 0.05 + 1e-12))
  ctx.fillStyle = COLORS.I
  const n = Math.floor(total / spacing)
  for (let k = 0; k < n; k++) {
    let d = (((k * spacing + phase) % total) + total) % total
    for (const s of segs) {
      if (d <= s.len) {
        const x = s.x + s.dx * d
        const y = s.y + s.dy * d
        if (!boxes.some((b) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h)) {
          ctx.globalAlpha = 0.25 + 0.75 * amp
          ctx.beginPath()
          ctx.arc(x, y, 4.5, 0, 2 * Math.PI)
          ctx.fill()
        }
        break
      }
      d -= s.len
    }
  }
  ctx.globalAlpha = 1
  ctx.fillStyle = pal.fg
  ctx.textAlign = 'left'
  ctx.fillText(`i = ${formatEng(current, 'A')}`, 14, 24)
}

function drawPlot(c: HTMLCanvasElement, p: CircuitParams, samples: Sample[], win: number, now: number, dark: boolean, t: (s: string) => string) {
  const ctx = c.getContext('2d')!
  const pal = palette(dark)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.fillStyle = pal.bg
  ctx.fillRect(0, 0, PW, PH)
  const left = 64
  const right = PW - 16
  const t0 = Math.max(0, now - win)
  const X = (tt: number) => left + ((tt - t0) / win) * (right - left)

  const panel = (top: number, bottom: number, title: string, series: { color: string; get: (s: Sample) => number; dash?: boolean; label: string }[], unit: string, minAbs: number) => {
    let m = minAbs
    for (const s of samples) for (const q of series) m = Math.max(m, Math.abs(q.get(s)))
    m *= 1.15
    const Y = (v: number) => bottom - ((v + m) / (2 * m)) * (bottom - top)
    ctx.strokeStyle = pal.grid
    ctx.lineWidth = 1
    ctx.fillStyle = pal.muted
    ctx.font = '12px system-ui, sans-serif'
    ctx.textAlign = 'right'
    for (const f of [-1, -0.5, 0, 0.5, 1]) {
      const y = Y(f * m)
      ctx.strokeStyle = f === 0 ? pal.muted : pal.grid
      ctx.beginPath()
      ctx.moveTo(left, y)
      ctx.lineTo(right, y)
      ctx.stroke()
      ctx.fillText(formatEng(f * m, unit, 2), left - 6, y + 4)
    }
    ctx.textAlign = 'left'
    ctx.fillStyle = pal.fg
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.fillText(title, left + 6, top + 14)
    let lx = left + 6 + ctx.measureText(title).width + 16
    ctx.font = '12px system-ui, sans-serif'
    for (const q of series) {
      ctx.fillStyle = q.color
      ctx.fillRect(lx, top + 5, 14, 3)
      ctx.fillText(q.label, lx + 18, top + 14)
      lx += 18 + ctx.measureText(q.label).width + 14
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(left, top, right - left, bottom - top)
    ctx.clip()
    for (const q of series) {
      ctx.strokeStyle = q.color
      ctx.lineWidth = q.dash ? 1.5 : 2.5
      ctx.setLineDash(q.dash ? [6, 5] : [])
      ctx.beginPath()
      samples.forEach((s, i) => (i ? ctx.lineTo(X(s.t), Y(q.get(s))) : ctx.moveTo(X(s.t), Y(q.get(s)))))
      ctx.stroke()
    }
    ctx.restore()
    ctx.setLineDash([])
  }

  const vs = [{ color: COLORS.V, get: (s: Sample) => s.v, dash: true, label: t('source') }, { color: COLORS.R, get: (s: Sample) => s.vR, label: 'v_R' }]
  if (p.kind !== 'RL') vs.push({ color: COLORS.C, get: (s: Sample) => s.vC, label: 'v_C' } as (typeof vs)[number])
  if (p.kind !== 'RC') vs.push({ color: COLORS.L, get: (s: Sample) => s.vL, label: 'v_L' } as (typeof vs)[number])
  panel(10, 230, t('Voltages'), vs, 'V', p.V)
  panel(250, 390, t('Current'), [{ color: COLORS.I, get: (s) => s.i, label: 'i' }], 'A', (p.V / p.R) * 0.2)

  // time axis
  ctx.fillStyle = pal.muted
  ctx.font = '12px system-ui, sans-serif'
  ctx.textAlign = 'center'
  for (let k = 0; k <= 4; k++) {
    const tt = t0 + (k / 4) * win
    ctx.fillText(formatEng(tt, 's', 2), X(tt), PH - 24)
  }
  ctx.fillText(t('time'), (left + right) / 2, PH - 6)
}
