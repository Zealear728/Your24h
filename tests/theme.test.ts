import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import bootstrapSource from '../public/theme-init.js?raw'
import { THEME_STORAGE_KEY, useTheme } from '../src/composables/useTheme'
import { STORAGE_KEY } from '../src/domain/storage'

let app: VueWrapper | undefined
let controls: ReturnType<typeof useTheme>
const originalMatchMedia = window.matchMedia

function mockSystem(dark: boolean) {
  let matches = dark
  const target = new EventTarget()
  const media = {
    get matches() { return matches },
    addEventListener: vi.fn(target.addEventListener.bind(target)),
    removeEventListener: vi.fn(target.removeEventListener.bind(target)),
  }
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: vi.fn(() => media) })
  return {
    media,
    change(value: boolean) {
      matches = value
      const event = new Event('change')
      Object.defineProperty(event, 'matches', { value })
      target.dispatchEvent(event)
    },
  }
}

function boot() {
  app = mount(defineComponent({
    setup() { controls = useTheme(); return () => null },
  }))
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="#f5f3ee" data-test-theme />')
})
afterEach(() => {
  app?.unmount()
  app = undefined
  document.documentElement.removeAttribute('data-theme')
  document.querySelector('[data-test-theme]')?.remove()
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: originalMatchMedia })
})

describe('主题首帧、偏好与系统设置', () => {
  it.each([
    { saved: null, os: false, expected: 'light' },
    { saved: null, os: true, expected: 'dark' },
    { saved: 'light', os: true, expected: 'light' },
    { saved: 'dark', os: false, expected: 'dark' },
    { saved: 'dark', os: true, expected: 'dark' },
    { saved: 'light', os: false, expected: 'light' },
    { saved: 'corrupted', os: true, expected: 'dark' },
    { saved: 'corrupted', os: false, expected: 'light' },
  ])('保存值=$saved、系统深色=$os：首帧和Vue都使用$expected', ({ saved, os, expected }) => {
    mockSystem(os)
    if (saved !== null) localStorage.setItem(THEME_STORAGE_KEY, saved)
    localStorage.setItem(STORAGE_KEY, 'keep schedule untouched')
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    // Execute the actual blocking script, without starting a real browser.
    new Function('window', 'document', bootstrapSource)(window, document)
    expect(document.documentElement.dataset.theme).toBe(expected)
    boot()
    expect(controls.theme.value).toBe(expected)
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(expected === 'dark' ? '#0b1120' : '#f5f3ee')
    expect(writes).not.toHaveBeenCalled()
    expect(localStorage.getItem(STORAGE_KEY)).toBe('keep schedule untouched')
  })

  it('未手动选择前跟随系统；手动选择后不再被系统覆盖', () => {
    const system = mockSystem(false)
    boot()
    system.change(true)
    expect(controls.theme.value).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
    controls.toggleTheme()
    expect(controls.theme.value).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    system.change(false)
    system.change(true)
    expect(controls.theme.value).toBe('light')
  })

  it('手动模式保存在独立键中，重新打开恢复；显式偏好始终优先', () => {
    const system = mockSystem(false)
    localStorage.setItem(STORAGE_KEY, '["untouched"]')
    boot()
    controls.toggleTheme()
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(localStorage.getItem(STORAGE_KEY)).toBe('["untouched"]')
    app!.unmount()
    boot()
    system.change(false)
    expect(controls.theme.value).toBe('dark')
    controls.toggleTheme()
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('写入失败仍可切换且锁定手动选择，之后可以重新保存', () => {
    const system = mockSystem(false)
    boot()
    const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    controls.toggleTheme()
    expect(controls.theme.value).toBe('dark')
    expect(controls.themeNotice.value).toContain('未能保存偏好')
    system.change(true)
    system.change(false)
    expect(controls.theme.value).toBe('dark')
    writes.mockRestore()
    controls.toggleTheme()
    expect(controls.themeNotice.value).toBe('')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('无法访问存储时，启动脚本和应用仍能使用系统主题', () => {
    mockSystem(true)
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => { throw new Error('security') })
    expect(() => new Function('window', 'document', bootstrapSource)(window, document)).not.toThrow()
    expect(document.documentElement.dataset.theme).toBe('dark')
    boot()
    expect(controls.theme.value).toBe('dark')
    controls.toggleTheme()
    expect(controls.theme.value).toBe('light')
    expect(controls.themeNotice.value).not.toBe('')
  })

  it('系统查询不可用时回退浅色；卸载后清理系统监听', () => {
    const system = mockSystem(false)
    boot()
    app!.unmount()
    expect(system.media.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function))
    Object.defineProperty(window, 'matchMedia', { value: undefined })
    expect(() => new Function('window', 'document', bootstrapSource)(window, document)).not.toThrow()
    boot()
    expect(controls.theme.value).toBe('light')
    controls.toggleTheme()
    expect(controls.theme.value).toBe('dark')
  })
})
