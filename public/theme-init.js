// Blocking head script: resolve the first paint before Vue and its styles load.
(() => {
  let preference = null
  try {
    const value = window.localStorage.getItem('your-24h.theme.v1')
    if (value === 'light' || value === 'dark') preference = value
  } catch { /* Storage may be unavailable; still honour the OS preference. */ }
  let systemDark = false
  try { systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches } catch { /* Fall back to light. */ }
  const theme = preference ?? (systemDark ? 'dark' : 'light')
  document.documentElement.dataset.theme = theme
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.content = theme === 'dark' ? '#0b1120' : '#f5f3ee'
})()
