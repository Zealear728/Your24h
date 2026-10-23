import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

export type Theme = 'light' | 'dark'
export const THEME_STORAGE_KEY = 'your-24h.theme.v1'

export function useTheme() {
  let preference: Theme | null = null
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (value === 'light' || value === 'dark') preference = value
  } catch { /* Manual switching still works when storage is blocked. */ }

  let media: MediaQueryList | undefined
  try { media = window.matchMedia('(prefers-color-scheme: dark)') } catch { /* Unsupported or restricted browser. */ }
  const theme = ref<Theme>(preference ?? (media?.matches ? 'dark' : 'light'))
  const themeNotice = ref('')

  watch(theme, value => {
    document.documentElement.dataset.theme = value
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (meta) meta.content = value === 'dark' ? '#252321' : '#f5f3ee'
  }, { immediate: true, flush: 'sync' })

  function toggleTheme() {
    const next = theme.value === 'light' ? 'dark' : 'light'
    // Lock the explicit choice in memory even if writing to storage fails.
    preference = next
    theme.value = next
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next)
      themeNotice.value = ''
    } catch {
      themeNotice.value = '主题已切换，但浏览器未能保存偏好；刷新后可能恢复默认模式。'
    }
  }

  function systemChanged(event: MediaQueryListEvent) {
    if (preference === null) theme.value = event.matches ? 'dark' : 'light'
  }

  onMounted(() => { media?.addEventListener('change', systemChanged) })
  onBeforeUnmount(() => { media?.removeEventListener('change', systemChanged) })
  return { theme, themeNotice, toggleTheme }
}
