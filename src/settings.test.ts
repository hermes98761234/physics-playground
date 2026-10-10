import { describe, expect, it } from 'vitest'
import { parseSettings } from './settings'

describe('settings', () => {
  it('round-trips valid JSON', () => {
    expect(parseSettings('{"lang":"uk","theme":"dark","tab":"optics"}')).toEqual({ lang: 'uk', theme: 'dark', tab: 'optics' })
  })
  it('falls back to defaults for junk', () => {
    const s = parseSettings('{"lang":"xx","theme":3,"tab":"nope"}')
    expect(s.theme).toBe('auto')
    expect(s.tab).toBe('wave')
    expect(parseSettings('not json').tab).toBe('wave')
    expect(parseSettings(null).theme).toBe('auto')
  })
})
