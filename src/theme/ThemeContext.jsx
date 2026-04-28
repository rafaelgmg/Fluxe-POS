import { createContext, useContext, useState } from 'react'
import { THEMES } from './themes'

const STORAGE_KEY = 'fluxe-theme-v1'

const ThemeCtx = createContext({
  mode:   'dark',
  tokens: THEMES.dark,
  toggle: () => {},
  setMode: () => {},
})

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(
    () => localStorage.getItem(STORAGE_KEY) || 'dark'
  )

  const setMode = (next) => {
    localStorage.setItem(STORAGE_KEY, next)
    setModeState(next)
  }

  const toggle = () => setMode(mode === 'dark' ? 'light' : 'dark')

  return (
    <ThemeCtx.Provider value={{ mode, tokens: THEMES[mode] ?? THEMES.dark, toggle, setMode }}>
      {children}
    </ThemeCtx.Provider>
  )
}

export const useTheme = () => useContext(ThemeCtx)
