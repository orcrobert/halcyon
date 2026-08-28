export type ThemeFamily = 'signature' | 'classic'

export interface ThemeSpec {
  id: string
  name: string
  blurb: string
  family: ThemeFamily
  bg: string
  line: string
  text: string
  muted: string
  accent: string
  brand: string
  danger: string
  success: string
  warn: string
  music: string
  sound: string
  bands: [string, string, string, string]
}

export const DEFAULT_THEME = 'midnight'

export const THEMES: ThemeSpec[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    blurb: 'Indigo on near-black. The Halcyon default.',
    family: 'signature',
    bg: '#08090e', line: '#32365a', text: '#e2e8f0', muted: '#64748b',
    accent: '#6366f1', brand: '#7c56ff', danger: '#ef4444',
    success: '#34d399', warn: '#fbbf24', music: '#8b5cf6', sound: '#0ea5e9',
    bands: ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b'],
  },
  {
    id: 'ember',
    name: 'Ember',
    blurb: 'Azure and orange over a desaturated slate.',
    family: 'signature',
    bg: '#08090b', line: '#3f4857', text: '#e4e9ee', muted: '#6b7885',
    accent: '#2b8bf5', brand: '#f97316', danger: '#e11d48',
    success: '#4ade80', warn: '#fb923c', music: '#f97316', sound: '#38bdf8',
    bands: ['#4f7dff', '#2dd4bf', '#fbbf24', '#f97316'],
  },
  {
    id: 'moss',
    name: 'Moss',
    blurb: 'Emerald and mint on a forest-dark ground.',
    family: 'signature',
    bg: '#060c09', line: '#32705c', text: '#e2f0ea', muted: '#648d7e',
    accent: '#10b981', brand: '#6ee7b7', danger: '#f43f5e',
    success: '#a3e635', warn: '#fbbf24', music: '#22d3ee', sound: '#34d399',
    bands: ['#22d3ee', '#34d399', '#a3e635', '#fbbf24'],
  },
  {
    id: 'quartz',
    name: 'Quartz',
    blurb: 'Rose and mauve against warm charcoal.',
    family: 'signature',
    bg: '#0d0a0c', line: '#4a3a44', text: '#f0e6ec', muted: '#8a7480',
    accent: '#f472b6', brand: '#c084fc', danger: '#fb7185',
    success: '#5eead4', warn: '#fcd34d', music: '#c084fc', sound: '#5eead4',
    bands: ['#c084fc', '#5eead4', '#fda4af', '#fcd34d'],
  },
  {
    id: 'sandstone',
    name: 'Sandstone',
    blurb: 'Amber and gold on sunbaked brown.',
    family: 'signature',
    bg: '#0d0a07', line: '#4d4034', text: '#f2ebe0', muted: '#8a7a66',
    accent: '#f59e0b', brand: '#fbbf24', danger: '#ef4444',
    success: '#84cc16', warn: '#fbbf24', music: '#f97316', sound: '#38bdf8',
    bands: ['#a78bfa', '#38bdf8', '#84cc16', '#f59e0b'],
  },
  {
    id: 'abyss',
    name: 'Abyss',
    blurb: 'Cyan and teal in deep water.',
    family: 'signature',
    bg: '#05090c', line: '#2d4a54', text: '#dcecef', muted: '#5f7d86',
    accent: '#22d3ee', brand: '#06b6d4', danger: '#fb7185',
    success: '#4ade80', warn: '#fbbf24', music: '#818cf8', sound: '#22d3ee',
    bands: ['#818cf8', '#22d3ee', '#4ade80', '#fbbf24'],
  },
  {
    id: 'plum',
    name: 'Plum',
    blurb: 'Violet lit by gold.',
    family: 'signature',
    bg: '#0b070e', line: '#43334f', text: '#ece4f2', muted: '#7d6b8c',
    accent: '#a855f7', brand: '#fbbf24', danger: '#f43f5e',
    success: '#4ade80', warn: '#fbbf24', music: '#a855f7', sound: '#38bdf8',
    bands: ['#a855f7', '#38bdf8', '#4ade80', '#fbbf24'],
  },
  {
    id: 'arctic',
    name: 'Arctic',
    blurb: 'Ice blue on cold grey.',
    family: 'signature',
    bg: '#080a0d', line: '#38424f', text: '#e8eef5', muted: '#6b7787',
    accent: '#7dd3fc', brand: '#38bdf8', danger: '#f87171',
    success: '#5eead4', warn: '#fcd34d', music: '#a5b4fc', sound: '#7dd3fc',
    bands: ['#a5b4fc', '#7dd3fc', '#5eead4', '#fcd34d'],
  },
  {
    id: 'clay',
    name: 'Clay',
    blurb: 'Terracotta and sage, earthy and quiet.',
    family: 'signature',
    bg: '#0c0908', line: '#4a3f39', text: '#f0e9e3', muted: '#857468',
    accent: '#e07a5f', brand: '#81b29a', danger: '#e11d48',
    success: '#81b29a', warn: '#e9c46a', music: '#e07a5f', sound: '#81b29a',
    bands: ['#b08bbb', '#81b29a', '#e9c46a', '#e07a5f'],
  },
  {
    id: 'citrus',
    name: 'Citrus',
    blurb: 'Lime and cyan, bright and dry.',
    family: 'signature',
    bg: '#070a07', line: '#364a36', text: '#e9f2e5', muted: '#6b7d68',
    accent: '#a3e635', brand: '#22d3ee', danger: '#fb7185',
    success: '#4ade80', warn: '#facc15', music: '#22d3ee', sound: '#a3e635',
    bands: ['#c084fc', '#22d3ee', '#a3e635', '#facc15'],
  },
  {
    id: 'dracula',
    name: 'Dracula',
    blurb: 'The purple-and-pink classic.',
    family: 'classic',
    bg: '#282a36', line: '#44475a', text: '#f8f8f2', muted: '#6272a4',
    accent: '#bd93f9', brand: '#ff79c6', danger: '#ff5555',
    success: '#50fa7b', warn: '#ffb86c', music: '#ff79c6', sound: '#8be9fd',
    bands: ['#bd93f9', '#8be9fd', '#50fa7b', '#ffb86c'],
  },
  {
    id: 'gruvbox',
    name: 'Gruvbox',
    blurb: 'Retro warmth, low glare.',
    family: 'classic',
    bg: '#1d2021', line: '#504945', text: '#ebdbb2', muted: '#928374',
    accent: '#83a598', brand: '#fe8019', danger: '#fb4934',
    success: '#b8bb26', warn: '#fabd2f', music: '#d3869b', sound: '#8ec07c',
    bands: ['#d3869b', '#83a598', '#b8bb26', '#fe8019'],
  },
  {
    id: 'nord',
    name: 'Nord',
    blurb: 'Arctic, north-bluish, calm.',
    family: 'classic',
    bg: '#2e3440', line: '#4c566a', text: '#eceff4', muted: '#616e88',
    accent: '#88c0d0', brand: '#81a1c1', danger: '#bf616a',
    success: '#a3be8c', warn: '#ebcb8b', music: '#b48ead', sound: '#88c0d0',
    bands: ['#b48ead', '#88c0d0', '#a3be8c', '#ebcb8b'],
  },
  {
    id: 'claude',
    name: 'Claude',
    blurb: 'Anthropic coral on warm paper-black.',
    family: 'classic',
    bg: '#191817', line: '#46403a', text: '#f5f1eb', muted: '#8a8078',
    accent: '#d97757', brand: '#cc785c', danger: '#bf4d3a',
    success: '#7fa87f', warn: '#d9a441', music: '#d97757', sound: '#7fa8a0',
    bands: ['#b08699', '#7fa8a0', '#7fa87f', '#d9a441'],
  },
  {
    id: 'solarized',
    name: 'Solarized',
    blurb: 'Precision contrast on deep cyan-black.',
    family: 'classic',
    bg: '#002b36', line: '#586e75', text: '#eee8d5', muted: '#657b83',
    accent: '#268bd2', brand: '#b58900', danger: '#dc322f',
    success: '#859900', warn: '#cb4b16', music: '#d33682', sound: '#2aa198',
    bands: ['#6c71c4', '#2aa198', '#859900', '#b58900'],
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    blurb: 'Neon over a rainy blue city.',
    family: 'classic',
    bg: '#1a1b26', line: '#414868', text: '#c0caf5', muted: '#565f89',
    accent: '#7aa2f7', brand: '#bb9af7', danger: '#f7768e',
    success: '#9ece6a', warn: '#e0af68', music: '#bb9af7', sound: '#7dcfff',
    bands: ['#bb9af7', '#7dcfff', '#9ece6a', '#e0af68'],
  },
  {
    id: 'catppuccin',
    name: 'Catppuccin',
    blurb: 'Mocha — pastel and soft-focus.',
    family: 'classic',
    bg: '#1e1e2e', line: '#585b70', text: '#cdd6f4', muted: '#7f849c',
    accent: '#cba6f7', brand: '#f5c2e7', danger: '#f38ba8',
    success: '#a6e3a1', warn: '#f9e2af', music: '#f5c2e7', sound: '#89dceb',
    bands: ['#cba6f7', '#89dceb', '#a6e3a1', '#f9e2af'],
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    blurb: 'Muted rose on a shadowed forest floor.',
    family: 'classic',
    bg: '#191724', line: '#524f67', text: '#e0def4', muted: '#6e6a86',
    accent: '#c4a7e7', brand: '#ebbcba', danger: '#eb6f92',
    success: '#9ccfd8', warn: '#f6c177', music: '#ebbcba', sound: '#9ccfd8',
    bands: ['#c4a7e7', '#9ccfd8', '#31748f', '#f6c177'],
  },
  {
    id: 'everforest',
    name: 'Everforest',
    blurb: 'Soft green, easy on long sessions.',
    family: 'classic',
    bg: '#2d353b', line: '#56635f', text: '#d3c6aa', muted: '#859289',
    accent: '#a7c080', brand: '#e69875', danger: '#e67e80',
    success: '#83c092', warn: '#dbbc7f', music: '#d699b6', sound: '#7fbbb3',
    bands: ['#d699b6', '#7fbbb3', '#a7c080', '#dbbc7f'],
  },
  {
    id: 'monokai',
    name: 'Monokai',
    blurb: 'High-contrast, unmistakably loud.',
    family: 'classic',
    bg: '#272822', line: '#49483e', text: '#f8f8f2', muted: '#75715e',
    accent: '#66d9ef', brand: '#fd971f', danger: '#f92672',
    success: '#a6e22e', warn: '#e6db74', music: '#ae81ff', sound: '#66d9ef',
    bands: ['#ae81ff', '#66d9ef', '#a6e22e', '#e6db74'],
  },
]

const SURFACE_STOPS = [0, 0.1, 0.16, 0.23, 0.29, 0.44, 0.5, 0.67, 0.75, 1]
const INK_LOW_STOPS = [0, 0.08, 0.26, 0.38, 0.75]
const INK_HIGH_STOPS = [0.52, 0.87, 1]
const DEEP_DROP = 0.07
const DEEP_BOOST = 1.03
const ACCENT_TINT = [0.22, 0.45, 0.68]
const BRAND_TINT = [0.42]
const DANGER_TINT = [0.28, 0.52]

const WHITE: Oklab = { L: 1, a: 0, b: 0 }

interface Oklab {
  L: number
  a: number
  b: number
}

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function toGamma(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055
}

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ]
}

function toOklab(hex: string): Oklab {
  const [sr, sg, sb] = parseHex(hex)
  const r = toLinear(sr)
  const g = toLinear(sg)
  const b = toLinear(sb)

  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)

  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  }
}

function toHex(color: Oklab): string {
  const l = (color.L + 0.3963377774 * color.a + 0.2158037573 * color.b) ** 3
  const m = (color.L - 0.1055613458 * color.a - 0.0638541728 * color.b) ** 3
  const s = (color.L - 0.0894841775 * color.a - 1.291485548 * color.b) ** 3

  const channels = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]

  return `#${channels
    .map((channel) => Math.round(Math.min(1, Math.max(0, toGamma(channel))) * 255))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`
}

function mix(from: Oklab, to: Oklab, t: number): Oklab {
  return {
    L: from.L + (to.L - from.L) * t,
    a: from.a + (to.a - from.a) * t,
    b: from.b + (to.b - from.b) * t,
  }
}

function deepen(seed: string): string {
  const base = toOklab(seed)
  return toHex({ L: base.L - DEEP_DROP, a: base.a * DEEP_BOOST, b: base.b * DEEP_BOOST })
}

function ramp(seed: string, tints: number[]): string[] {
  const base = toOklab(seed)
  return [deepen(seed), seed, ...tints.map((tint) => toHex(mix(base, WHITE, tint)))]
}

function scale(from: string, to: string, stops: number[]): string[] {
  const start = toOklab(from)
  const end = toOklab(to)
  return stops.map((stop) => toHex(mix(start, end, stop)))
}

export function themeVariables(spec: ThemeSpec): Record<string, string> {
  const surfaces = scale(spec.bg, spec.line, SURFACE_STOPS)
  const inkLow = toHex(mix(toOklab(spec.muted), toOklab(spec.bg), 0.62))
  const inks = [
    ...scale(inkLow, spec.muted, INK_LOW_STOPS),
    spec.muted,
    ...scale(spec.muted, spec.text, INK_HIGH_STOPS),
    toHex(mix(toOklab(spec.text), WHITE, 0.22)),
  ]
  const accents = ramp(spec.accent, ACCENT_TINT)
  const brands = ramp(spec.brand, BRAND_TINT)
  const dangers = ramp(spec.danger, DANGER_TINT)

  const variables: Record<string, string> = {
    '--color-surface-danger': toHex(mix(toOklab(spec.bg), toOklab(spec.danger), 0.12)),
    '--color-success': spec.success,
    '--color-warn': spec.warn,
    '--color-tag-music': spec.music,
    '--color-tag-sound': spec.sound,
    '--color-band-theta': spec.bands[0],
    '--color-band-alpha': spec.bands[1],
    '--color-band-beta': spec.bands[2],
    '--color-band-gamma': spec.bands[3],
  }

  surfaces.forEach((value, i) => { variables[`--surface-${i}`] = value })
  inks.forEach((value, i) => { variables[`--ink-${i}`] = value })
  accents.forEach((value, i) => { variables[`--accent-${i}`] = value })
  brands.forEach((value, i) => { variables[`--brand-${i}`] = value })
  dangers.forEach((value, i) => { variables[`--danger-${i}`] = value })

  return variables
}

export function getTheme(id: string): ThemeSpec {
  return THEMES.find((theme) => theme.id === id) ?? THEMES[0]
}

export function applyTheme(id: string): void {
  const root = document.documentElement
  const previous = root.dataset.theme

  if (previous) {
    for (const name of Object.keys(themeVariables(getTheme(previous)))) {
      root.style.removeProperty(name)
    }
  }

  if (id === DEFAULT_THEME) {
    delete root.dataset.theme
    return
  }

  const spec = getTheme(id)
  for (const [name, value] of Object.entries(themeVariables(spec))) {
    root.style.setProperty(name, value)
  }
  root.dataset.theme = spec.id
}

const STORAGE_KEY = 'halcyon_theme'

export function storedTheme(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved && THEMES.some((theme) => theme.id === saved) ? saved : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

export function storeTheme(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    /* private browsing: the theme still applies for this session */
  }
}
