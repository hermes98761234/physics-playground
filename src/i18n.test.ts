import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tr, UK } from './i18n'

/** Literal strings passed to t('…') / N('…') or given as label="…" / label: '…' / title="…" anywhere in src/, excluding tests. */
function usedKeys(dir = 'src'): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...usedKeys(p))
    else if (/\.tsx?$/.test(name) && !name.includes('.test.')) {
      const src = readFileSync(p, 'utf8')
      for (const m of src.matchAll(/\b[tN]\(\s*(['"])((?:(?!\1).)*)\1/g)) out.push(m[2])
      for (const m of src.matchAll(/\b(?:label|title)(?:=|:\s*)\{?(['"])((?:(?!\1).)*)\1/g)) out.push(m[2])
    }
  }
  return out
}

describe('tr', () => {
  it('substitutes placeholders', () => {
    expect(tr('en', 'Error: {0}', 'boom')).toBe('Error: boom')
  })
  it('falls back to English for unknown strings', () => {
    expect(tr('uk', 'Not in the dictionary {0}', 1)).toBe('Not in the dictionary 1')
  })
  it('translates a known string', () => {
    expect(tr('uk', 'Dark')).toBe('Темна')
  })
})

describe('UK dictionary', () => {
  it('keeps the same placeholders as the English source', () => {
    const ph = (s: string) => (s.match(/\{\d+\}/g) ?? []).sort().join()
    for (const [en, uk] of Object.entries(UK)) expect(ph(uk), en).toBe(ph(en))
  })
  it('translates every string the UI uses', () => {
    const keys = usedKeys()
    expect(keys.length).toBeGreaterThan(20)
    expect([...new Set(keys.filter((k) => !(k in UK)))]).toEqual([])
  })
})
