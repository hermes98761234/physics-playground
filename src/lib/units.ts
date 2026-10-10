/** Format a value with an SI prefix, e.g. formatEng(0.0125, 'A') = '12.5 mA'. */
export function formatEng(value: number, unit: string, digits = 3): string {
  if (value === 0 || !Number.isFinite(value)) return `0 ${unit}`
  const prefixes = ['p', 'n', 'µ', 'm', '', 'k', 'M', 'G']
  const exp = Math.max(-4, Math.min(3, Math.floor(Math.log10(Math.abs(value)) / 3)))
  const scaled = value / Math.pow(10, exp * 3)
  const s = Number(scaled.toPrecision(digits)).toString()
  return `${s} ${prefixes[exp + 4]}${unit}`
}
