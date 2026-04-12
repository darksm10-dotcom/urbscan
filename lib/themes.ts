export interface AppTheme {
  id: string
  name: string
  color: string
  vars: Record<string, string>
}

export const THEMES: AppTheme[] = [
  {
    id: 'spotify',
    name: 'SPOTIFY',
    color: '#1DB954',
    vars: {
      '--font-ui': "'DM Sans', sans-serif",
      '--bg': '#121212',
      '--bg-card': '#181818',
      '--bg-elevated': '#282828',
      '--border': 'rgba(255, 255, 255, 0.08)',
      '--border-bright': 'rgba(255, 255, 255, 0.22)',
      '--amber': '#1DB954',
      '--amber-dim': 'rgba(29, 185, 84, 0.55)',
      '--amber-glow': 'rgba(29, 185, 84, 0.10)',
      '--cyan': '#FFFFFF',
      '--cyan-dim': 'rgba(255, 255, 255, 0.45)',
      '--cyan-glow': 'rgba(255, 255, 255, 0.05)',
      '--grid-dot': 'transparent',
      '--text-primary': '#FFFFFF',
      '--text-secondary': '#B3B3B3',
      '--text-dim': '#6B6B6B',
      '--green': '#158A3E',
      '--green-bright': '#1ED760',
      '--red': '#E91429',
    },
  },
]

export const DEFAULT_THEME_ID = 'spotify'

export function applyTheme(theme: AppTheme): void {
  const root = document.documentElement
  root.style.setProperty('--font-ui', "'DM Sans', sans-serif")
  Object.entries(theme.vars).forEach(([key, value]) => {
    root.style.setProperty(key, value)
  })
  root.setAttribute('data-theme', theme.id)
}

export function getThemeById(id: string): AppTheme {
  return THEMES[0]
}
