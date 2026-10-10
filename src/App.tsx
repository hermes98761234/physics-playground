import { useEffect, useState } from 'react'
import { AppCtx } from './ctx'
import { tr, type T } from './i18n'
import { loadSettings, saveSettings, type Lang, type Settings, type TabId, type Theme } from './settings'
import CircuitSim from './sims/CircuitSim'
import FieldSim from './sims/FieldSim'
import OpticsSim from './sims/OpticsSim'
import PendulumSim from './sims/PendulumSim'
import WaveSim from './sims/WaveSim'

const TAB_DEFS: { id: TabId; label: string }[] = [
  { id: 'wave', label: 'Waves' },
  { id: 'optics', label: 'Optics' },
  { id: 'field', label: 'Electric field' },
  { id: 'circuit', label: 'Circuits' },
  { id: 'pendulum', label: 'Pendulum' },
]

function useSystemDark() {
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const on = () => setDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return dark
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const systemDark = useSystemDark()
  const { lang, theme, tab } = settings
  const t: T = (s, ...a) => tr(lang, s, ...a)
  const dark = theme === 'auto' ? systemDark : theme === 'dark'
  const update = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }))

  useEffect(() => saveSettings(settings), [settings])
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = theme
    root.lang = lang
    document.title = lang === 'uk' ? 'Фізична пісочниця: хвилі, оптика, кола' : 'Physics Playground: waves, optics and circuits'
  }, [theme, lang])

  return (
    <AppCtx.Provider value={{ t, dark }}>
      <div className="app">
        <header className="toolbar">
          <span className="brand">{t('Physics Playground')}</span>
          <span className="hint grow">{t('Interactive waves, optics, fields, circuits and chaos, computed in your browser.')}</span>
          <label className="inline">
            {t('Language')}
            <select value={lang} onChange={(e) => update({ lang: e.target.value as Lang })} aria-label={t('Language')}>
              <option value="en">English</option>
              <option value="uk">Українська</option>
            </select>
          </label>
          <label className="inline">
            {t('Theme')}
            <select value={theme} onChange={(e) => update({ theme: e.target.value as Theme })} aria-label={t('Theme')}>
              <option value="auto">{t('System')}</option>
              <option value="light">{t('Light')}</option>
              <option value="dark">{t('Dark')}</option>
            </select>
          </label>
        </header>
        <nav className="tabs" role="tablist" aria-label={t('Simulations')}>
          {TAB_DEFS.map((d) => (
            <button key={d.id} role="tab" aria-selected={tab === d.id} className={tab === d.id ? 'on' : ''} onClick={() => update({ tab: d.id })}>
              {t(d.label)}
            </button>
          ))}
        </nav>
        <div role="tabpanel" className="panelwrap">
          {tab === 'wave' && <WaveSim />}
          {tab === 'optics' && <OpticsSim />}
          {tab === 'field' && <FieldSim />}
          {tab === 'circuit' && <CircuitSim />}
          {tab === 'pendulum' && <PendulumSim />}
        </div>
        <p className="hint foot">
          {t('Everything runs locally in your browser. Nothing is sent anywhere.')}{' '}
          <a href="https://github.com/hermes98761234/physics-playground">{t('Source on GitHub')}</a>
        </p>
      </div>
    </AppCtx.Provider>
  )
}
