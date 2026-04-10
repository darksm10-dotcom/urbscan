export interface AppTheme {
  id: string
  name: string
  color: string // swatch color for picker
  vars: Record<string, string>
}

export const THEMES: AppTheme[] = [
  {
    id: 'blue',
    name: 'DIGITAL',
    color: '#00a8ff',
    vars: {
      '--bg': '#060810',
      '--bg-card': '#090d16',
      '--bg-elevated': '#0e1520',
      '--border': 'rgba(0, 168, 255, 0.12)',
      '--border-bright': 'rgba(0, 168, 255, 0.4)',
      '--amber': '#00a8ff',
      '--amber-dim': 'rgba(0, 168, 255, 0.55)',
      '--amber-glow': 'rgba(0, 168, 255, 0.08)',
      '--cyan': '#e8f4ff',
      '--cyan-dim': 'rgba(232, 244, 255, 0.45)',
      '--cyan-glow': 'rgba(232, 244, 255, 0.07)',
      '--grid-dot': 'rgba(0, 168, 255, 0.045)',
      '--text-primary': '#d0e8ff',
      '--text-secondary': '#5a7a9a',
      '--text-dim': '#2a3a52',
      '--green': '#1a6a8a',
      '--green-bright': '#00c8ff',
      '--red': '#4a2a6a',
    },
  },
  {
    id: 'amber',
    name: 'TACTICAL',
    color: '#d4a03c',
    vars: {
      '--bg': '#070806',
      '--bg-card': '#0b0c09',
      '--bg-elevated': '#131410',
      '--border': 'rgba(212, 160, 60, 0.12)',
      '--border-bright': 'rgba(212, 160, 60, 0.4)',
      '--amber': '#d4a03c',
      '--amber-dim': 'rgba(212, 160, 60, 0.55)',
      '--amber-glow': 'rgba(212, 160, 60, 0.08)',
      '--cyan': '#00d4a8',
      '--cyan-dim': 'rgba(0, 212, 168, 0.45)',
      '--cyan-glow': 'rgba(0, 212, 168, 0.07)',
      '--grid-dot': 'rgba(212, 160, 60, 0.045)',
      '--text-primary': '#e8dfc8',
      '--text-secondary': '#8c7f65',
      '--text-dim': '#4a4435',
      '--green': '#5a8a4a',
      '--green-bright': '#7ab86a',
      '--red': '#8a4a4a',
    },
  },
  {
    id: 'green',
    name: 'MATRIX',
    color: '#00ff88',
    vars: {
      '--bg': '#050f08',
      '--bg-card': '#081208',
      '--bg-elevated': '#0d1a0d',
      '--border': 'rgba(0, 255, 136, 0.1)',
      '--border-bright': 'rgba(0, 255, 136, 0.35)',
      '--amber': '#00ff88',
      '--amber-dim': 'rgba(0, 255, 136, 0.5)',
      '--amber-glow': 'rgba(0, 255, 136, 0.07)',
      '--cyan': '#88ffcc',
      '--cyan-dim': 'rgba(136, 255, 204, 0.4)',
      '--cyan-glow': 'rgba(136, 255, 204, 0.06)',
      '--grid-dot': 'rgba(0, 255, 136, 0.04)',
      '--text-primary': '#c0ffd8',
      '--text-secondary': '#4a7a5a',
      '--text-dim': '#1a3a28',
      '--green': '#1a6a4a',
      '--green-bright': '#00ff88',
      '--red': '#6a3a1a',
    },
  },
  {
    id: 'apple',
    name: 'CLEAN',
    color: '#0071e3',
    vars: {
      '--font-ui': "'Plus Jakarta Sans', sans-serif",
      '--bg': '#f5f5f7',
      '--bg-card': '#ffffff',
      '--bg-elevated': '#f0f0f5',
      '--border': 'rgba(0, 0, 0, 0.08)',
      '--border-bright': 'rgba(0, 0, 0, 0.18)',
      '--amber': '#0071e3',
      '--amber-dim': 'rgba(0, 113, 227, 0.45)',
      '--amber-glow': 'rgba(0, 113, 227, 0.08)',
      '--cyan': '#1d1d1f',
      '--cyan-dim': 'rgba(29, 29, 31, 0.35)',
      '--cyan-glow': 'rgba(29, 29, 31, 0.05)',
      '--grid-dot': 'transparent',
      '--text-primary': '#1d1d1f',
      '--text-secondary': '#6e6e73',
      '--text-dim': '#aeaeb2',
      '--green': '#28a745',
      '--green-bright': '#34c759',
      '--red': '#ff3b30',
    },
  },
  {
    id: 'red',
    name: 'ALERT',
    color: '#ff4040',
    vars: {
      '--bg': '#0f0606',
      '--bg-card': '#140808',
      '--bg-elevated': '#1a0c0c',
      '--border': 'rgba(255, 64, 64, 0.12)',
      '--border-bright': 'rgba(255, 64, 64, 0.4)',
      '--amber': '#ff4040',
      '--amber-dim': 'rgba(255, 64, 64, 0.55)',
      '--amber-glow': 'rgba(255, 64, 64, 0.08)',
      '--cyan': '#ff9900',
      '--cyan-dim': 'rgba(255, 153, 0, 0.45)',
      '--cyan-glow': 'rgba(255, 153, 0, 0.07)',
      '--grid-dot': 'rgba(255, 64, 64, 0.04)',
      '--text-primary': '#ffd0c8',
      '--text-secondary': '#7a4a4a',
      '--text-dim': '#3a2020',
      '--green': '#6a3a3a',
      '--green-bright': '#ff6666',
      '--red': '#8a2a2a',
    },
  },
]

export const DEFAULT_THEME_ID = 'blue'

export function applyTheme(theme: AppTheme): void {
  const root = document.documentElement
  // Reset font-ui to default for dark themes before applying
  root.style.setProperty('--font-ui', "'JetBrains Mono', monospace")
  Object.entries(theme.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
  root.setAttribute('data-theme', theme.id)
}

export function getThemeById(id: string): AppTheme {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === DEFAULT_THEME_ID)!
}
