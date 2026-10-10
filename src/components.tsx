import type { ReactNode } from 'react'
import { useT } from './ctx'

export function Slider(props: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  const t = useT()
  const { label, value, min, max, step, onChange, format } = props
  return (
    <div className="field">
      <label>
        <span>{t(label)}</span>
        <b className="val">{format ? format(value) : value}</b>
      </label>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={t(label)} onChange={(e) => onChange(+e.target.value)} />
    </div>
  )
}

export function Seg<V extends string>(props: { label?: string; value: V; options: { value: V; label: string }[]; onChange: (v: V) => void }) {
  const t = useT()
  return (
    <div className="field">
      {props.label && <label>{t(props.label)}</label>}
      <div className="seg" role="group" aria-label={props.label ? t(props.label) : undefined}>
        {props.options.map((o) => (
          <button key={o.value} className={o.value === props.value ? 'on' : ''} aria-pressed={o.value === props.value} onClick={() => props.onChange(o.value)}>
            {t(o.label)}
          </button>
        ))}
      </div>
    </div>
  )
}

export function Check(props: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  const t = useT()
  return (
    <label className="check">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} /> {t(props.label)}
    </label>
  )
}

export function Panel(props: { title: string; children: ReactNode }) {
  const t = useT()
  return (
    <div className="section">
      <h3>{t(props.title)}</h3>
      {props.children}
    </div>
  )
}

export function Layout(props: { controls: ReactNode; children: ReactNode; explain: ReactNode }) {
  return (
    <div className="body">
      <aside className="side">
        <div className="panel">{props.controls}</div>
      </aside>
      <main className="main">{props.children}</main>
      <div className="explain-wrap">
        <div className="box explain">{props.explain}</div>
      </div>
    </div>
  )
}
