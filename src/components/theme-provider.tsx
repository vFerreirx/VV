'use client'

import { ThemeProvider as NextThemeProvider, type ThemeProviderProps } from 'next-themes'

// Wrapper client-only do next-themes, pra ser usado no RootLayout (server).
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemeProvider {...props}>{children}</NextThemeProvider>
}
