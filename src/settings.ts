export type Lang = 'en' | 'uk'
export type Theme = 'auto' | 'light' | 'dark'
export type TabId = 'wave' | 'optics' | 'field' | 'circuit' | 'pendulum'

export interface Settings {
  lang: Lang
  theme: Theme
  tab: TabId
}

export const TABS: TabId[] = ['wave', 'optics', 'field', 'circuit', 'pendulum']
const KEY = 'physics-playground:v1'

export function defaultSettings(): Settings {
  const uk = typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('uk')
  return { lang: uk ? 'uk' : 'en', theme: 'auto', tab: 'wave' }
}

export function parseSettings(raw: string | null): Settings {
  const d = defaultSettings()
  if (!raw) return d
  try {
    const o = JSON.parse(raw) as Partial<Settings>
    return {
      lang: o.lang === 'en' || o.lang === 'uk' ? o.lang : d.lang,
      theme: o.theme === 'auto' || o.theme === 'light' || o.theme === 'dark' ? o.theme : d.theme,
      tab: TABS.includes(o.tab as TabId) ? (o.tab as TabId) : d.tab,
    }
  } catch {
    return d
  }
}

export function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(KEY))
  } catch {
    return defaultSettings()
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable: settings just won't persist */
  }
}
