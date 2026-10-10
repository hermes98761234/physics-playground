import { useCallback, useEffect, useRef, useState } from 'react'
import { Layout, Panel, Seg, Slider } from '../components'
import { useDark, useFrame, useT } from '../ctx'
import { createCpuWave, createGpuWave, type WaveBackend } from '../gpu/wave'
import { buildPreset, CFL_LIMIT, GRID_H, GRID_W, MAX_SOURCES, paintDisc, type LineSource, type PointSource, type PresetName } from '../lib/wave'

type Tool = 'source' | 'wall' | 'erase'

export default function WaveSim() {
  const t = useT()
  const dark = useDark()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const backend = useRef<WaveBackend | null>(null)
  const [initial] = useState(() => buildPreset('doubleSlit'))
  const wall = useRef(initial.wall)
  const sources = useRef<PointSource[]>(initial.sources)
  const line = useRef<LineSource | null>(initial.line)
  const [preset, setPreset] = useState<PresetName>('doubleSlit')
  const [tool, setTool] = useState<Tool>('wall')
  const [freq, setFreq] = useState(30)
  const [courant, setCourant] = useState(0.5)
  const [gain, setGain] = useState(1)
  const [speed, setSpeed] = useState(4)
  const [brush, setBrush] = useState(5)
  const [running, setRunning] = useState(true)
  const [mode, setMode] = useState<'gpu' | 'cpu'>('gpu')
  const [kind, setKind] = useState<'gpu' | 'cpu' | null>(null)
  const [nSources, setNSources] = useState(initial.sources.length + (initial.line ? 1 : 0))
  const painting = useRef(false)
  const live = useRef({ freq, courant, gain, dark, speed, running })
  useEffect(() => {
    live.current = { freq, courant, gain, dark, speed, running }
  })

  const loadPreset = useCallback((name: PresetName) => {
    const s = buildPreset(name)
    wall.current = s.wall
    sources.current = s.sources
    line.current = s.line
    setNSources(s.sources.length + (s.line ? 1 : 0))
    backend.current?.setWall(wall.current)
    backend.current?.reset()
  }, [])

  // Create the backend (WebGPU if it works, else the CPU fallback on a fresh canvas).
  useEffect(() => {
    const canvas = canvasRef.current!
    let dead = false
    ;(async () => {
      let b: WaveBackend | null = null
      if (mode === 'gpu') {
        try {
          b = await createGpuWave(canvas)
        } catch {
          b = null
        }
        if (!b && !dead) {
          setMode('cpu')
          return
        }
      } else b = createCpuWave(canvas)
      if (!b || dead) return
      backend.current = b
      setKind(b.kind)
      b.setWall(wall.current)
      b.draw(live.current.gain, live.current.dark)
    })()
    return () => {
      dead = true
      backend.current?.destroy()
      backend.current = null
    }
  }, [mode])

  useFrame(() => {
    const b = backend.current
    if (!b) return
    const l = live.current
    if (l.running) b.step(l.speed, { courant: l.courant, freq: l.freq / 1000, sources: sources.current, line: line.current })
    b.draw(l.gain, l.dark)
  })

  const cell = (e: React.PointerEvent) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * GRID_W, y: ((e.clientY - r.top) / r.height) * GRID_H }
  }
  const paintAt = (e: React.PointerEvent) => {
    const c = cell(e)
    paintDisc(wall.current, GRID_W, GRID_H, c.x, c.y, brush, tool === 'wall' ? 1 : 0)
    backend.current?.setWall(wall.current)
  }
  const onDown = (e: React.PointerEvent) => {
    canvasRef.current?.setPointerCapture(e.pointerId)
    if (tool === 'source') {
      const c = cell(e)
      const near = sources.current.findIndex((s) => Math.hypot(s.x - c.x, s.y - c.y) < 8)
      if (near >= 0) sources.current = sources.current.filter((_, i) => i !== near)
      else if (sources.current.length < MAX_SOURCES) sources.current = [...sources.current, { x: Math.round(c.x), y: Math.round(c.y) }]
      setNSources(sources.current.length + (line.current ? 1 : 0))
    } else {
      painting.current = true
      paintAt(e)
    }
  }
  const onMove = (e: React.PointerEvent) => {
    if (painting.current) paintAt(e)
  }
  const onUp = () => {
    painting.current = false
  }

  const wavelength = courant / (freq / 1000)

  return (
    <Layout
      controls={
        <>
          <Panel title="Scene">
            <div className="field">
              <select
                aria-label={t('Scene')}
                value={preset}
                onChange={(e) => {
                  setPreset(e.target.value as PresetName)
                  loadPreset(e.target.value as PresetName)
                }}
              >
                <option value="doubleSlit">{t('Double slit')}</option>
                <option value="singleSlit">{t('Single slit')}</option>
                <option value="ripple">{t('Single ripple source')}</option>
                <option value="lens">{t('Parabolic mirror')}</option>
                <option value="empty">{t('Empty tank')}</option>
              </select>
            </div>
            <Seg
              label="Mouse tool"
              value={tool}
              onChange={setTool}
              options={[
                { value: 'wall', label: 'Paint wall' },
                { value: 'erase', label: 'Erase' },
                { value: 'source', label: 'Add source' },
              ]}
            />
            {tool !== 'source' && <Slider label="Brush size" value={brush} min={1} max={14} step={1} onChange={setBrush} />}
            <div className="row">
              <button onClick={() => setRunning(!running)}>{running ? t('Pause') : t('Run')}</button>
              <button onClick={() => backend.current?.reset()}>{t('Reset waves')}</button>
            </div>
            <div className="row">
              <button
                onClick={() => {
                  wall.current = new Uint8Array(GRID_W * GRID_H)
                  backend.current?.setWall(wall.current)
                }}
              >
                {t('Clear walls')}
              </button>
              <button
                onClick={() => {
                  sources.current = []
                  line.current = null
                  setNSources(0)
                }}
              >
                {t('Clear sources')}
              </button>
            </div>
          </Panel>
          <Panel title="Wave">
            <Slider label="Frequency" value={freq} min={10} max={50} step={1} onChange={setFreq} format={(v) => `${v} / 1000 ${t('steps')}`} />
            <Slider label="Wave speed" value={courant} min={0.2} max={0.7} step={0.01} onChange={setCourant} format={(v) => `${v.toFixed(2)} ${t('cells/step')}`} />
            <Slider label="Brightness" value={gain} min={0.3} max={4} step={0.1} onChange={setGain} format={(v) => `${v.toFixed(1)}×`} />
            <Slider label="Steps per frame" value={speed} min={1} max={12} step={1} onChange={setSpeed} />
          </Panel>
          <Panel title="Numerics">
            <p className="hint">
              {t('Courant number')} r = {courant.toFixed(2)} ({t('stability limit')} {CFL_LIMIT.toFixed(3)}) · λ ≈ {wavelength.toFixed(1)} {t('cells')}
            </p>
            <p className="hint">
              {kind === 'gpu' ? t('Running on the GPU (WebGPU compute shader).') : kind === 'cpu' ? t('WebGPU is not available: running on the CPU.') : t('Starting…')}
              {' '}
              {nSources > 0 ? '' : t('No source: add one with the mouse tool.')}
            </p>
          </Panel>
        </>
      }
      explain={
        <>
          <h3>{t('What you are seeing')}</h3>
          <p>{t('A ripple tank: the 2D wave equation u_tt = c² ∇²u is advanced with a leapfrog scheme, one GPU thread per grid cell. Orange is a crest, blue is a trough. Waves reflect off the grey walls and fade in the absorbing border.')}</p>
          <p>{t('Try the double slit: the two openings act as new sources and the waves interfere, giving bright and dark fringes with spacing about λ·L/d. Shorter wavelengths (higher frequency or lower speed) make narrower fringes. The scheme is stable only while the Courant number c·dt/dx stays below 1/√2.')}</p>
        </>
      }
    >
      <div className="canvas-wrap">
        <canvas
          key={mode}
          ref={canvasRef}
          className="sim-canvas wave-canvas"
          style={{ aspectRatio: `${GRID_W} / ${GRID_H}`, cursor: tool === 'source' ? 'copy' : 'crosshair' }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          role="img"
          aria-label={t('Ripple tank simulation. Paint walls or add sources with the mouse.')}
        />
      </div>
    </Layout>
  )
}
