import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import App from '../src/App.vue'
import { STORAGE_KEY } from '../src/domain/storage'
import { localDate, shiftDate } from '../src/domain/time'
import type { TimeBlock } from '../src/domain/time'
import { THEME_STORAGE_KEY } from '../src/composables/useTheme'

const today = localDate()
const old: TimeBlock = { id: 'old', date: today, startMinute: 540, endMinute: 660, title: '原有安排', color: 'neutral' }
const incoming: TimeBlock[] = [
  { id: 'new', date: today, startMinute: 840, endMinute: 960, title: '恢复今天', color: 'sky' },
  { id: 'tomorrow', date: shiftDate(today, 1), startMinute: 540, endMinute: 570, title: '恢复明天', color: 'rose' },
]
const backup = (blocks: unknown) => JSON.stringify({ format: 'your24h-backup', version: 1, exportedAt: '2026-10-26T14:00:00.000Z', blocks })
let app: VueWrapper
const originalCreateURL = URL.createObjectURL
const originalRevokeURL = URL.revokeObjectURL

beforeEach(() => {
  localStorage.clear()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: vi.fn(() => 'blob:test-backup') })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: vi.fn() })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: originalCreateURL })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: originalRevokeURL })
})

function boot(data: TimeBlock[] = [old]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  app = mount(App, { attachTo: document.body })
}
async function open() { await app.get('.backup-toggle').trigger('click') }
async function select(text: string) {
  const input = app.get('[aria-label="选择 JSON 备份文件"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [new File([text], 'test-backup.json', { type: 'application/json' })] })
  await input.trigger('change')
  await vi.waitFor(() => expect(app.text()).not.toContain('正在读取并校验文件'))
}
async function confirm() {
  await app.get('.backup-confirm input').setValue(true)
  await app.get('.backup-restore').trigger('click')
  await flushPromises()
}
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')

describe('备份导入导出界面', () => {
  it('下载包含所有日期，输出Blob与文件名正确，不更改日程', async () => {
    boot([old, { ...old, id: 'next', date: shiftDate(today, 1) }])
    const original = localStorage.getItem(STORAGE_KEY)
    await open()
    await app.get('.backup-actions button').trigger('click')
    const click = vi.mocked(HTMLAnchorElement.prototype.click)
    const anchor = click.mock.instances[0] as HTMLAnchorElement
    expect(anchor.download).toBe(`your24h-backup-${today}.json`)
    expect(anchor.href).toBe('blob:test-backup')
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob
    const text = await new Promise<string>(resolve => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(blob)
    })
    expect(JSON.parse(text).blocks).toEqual(stored())
    expect(localStorage.getItem(STORAGE_KEY)).toBe(original)
    expect(app.text()).toContain('已发起备份下载')
  })

  it('先显示日期和块数，要求主动确认；只写一次并立即更新全部日期画布', async () => {
    boot()
    await open()
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    await select(backup(incoming))
    expect(app.get('.backup-count').text()).toBe('包含 2 个日期、2 个时间块')
    expect(app.text()).toContain('替换当前浏览器的全部日程')
    expect(app.get('.backup-restore').attributes('disabled')).toBeDefined()
    expect(stored()).toEqual([old])
    expect(writes).not.toHaveBeenCalled()
    await confirm()
    expect(writes).toHaveBeenCalledTimes(1)
    expect(writes.mock.calls[0][0]).toBe(STORAGE_KEY)
    expect(JSON.parse(writes.mock.calls[0][1])).toEqual(incoming)
    expect(stored()).toEqual(incoming)
    expect(app.get('.block-title').text()).toBe('恢复今天')
    await app.get('[aria-label="关闭数据备份"]').trigger('click')
    await app.get('[aria-label="后一天"]').trigger('click')
    expect(app.get('.block-title').text()).toBe('恢复明天')
    app.unmount()
    app = mount(App, { attachTo: document.body })
    expect(app.get('.block-title').text()).toBe('恢复今天')
  })

  it.each([
    '{broken', backup([{ ...old, id: 'bad', date: '2026-02-30' }]),
    backup([old, { ...old, id: 'overlap', startMinute: 600, endMinute: 720 }]),
    backup([incoming[0], { ...incoming[1], color: 'unknown' }]),
  ])('损坏、非法和部分错误文件拒绝整份，不写入任何数据', async text => {
    boot()
    await open()
    const before = localStorage.getItem(STORAGE_KEY)
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    await select(text)
    expect(app.find('.backup-error').exists()).toBe(true)
    expect(app.find('.backup-restore').exists()).toBe(false)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before)
    expect(writes).not.toHaveBeenCalled()
    expect(app.get('.block-title').text()).toBe('原有安排')
  })

  it('取消或关闭待恢复备份，保留旧数据；覆盖前可以先下载旧数据', async () => {
    boot()
    await open()
    await select(backup(incoming))
    await app.get('.backup-export-first').trigger('click')
    expect(URL.createObjectURL).toHaveBeenCalledOnce()
    await app.get('.backup-preview .backup-actions button:last-child').trigger('click')
    expect(stored()).toEqual([old])
    expect(app.find('.backup-preview').exists()).toBe(false)
    await select(backup(incoming))
    await app.get('[aria-label="关闭数据备份"]').trigger('click')
    expect(stored()).toEqual([old])
  })

  it('写入失败时原存储、画布均保留；恢复写权限后可重试', async () => {
    boot()
    await open()
    await select(backup(incoming))
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    await confirm()
    expect(stored()).toEqual([old])
    expect(app.get('.block-title').text()).toBe('原有安排')
    expect(app.get('.backup-error').text()).toContain('原有日程和未提交输入均未更改')
    fail.mockRestore()
    await app.get('.backup-restore').trigger('click')
    expect(stored()).toEqual(incoming)
  })

  it('空备份明确提示清空，需要确认才能替换', async () => {
    boot()
    await open()
    await select(backup([]))
    expect(app.text()).toContain('这是空备份')
    expect(stored()).toEqual([old])
    await confirm()
    expect(stored()).toEqual([])
    expect(app.find('.time-block').exists()).toBe(false)
  })

  it('数据备份取消不会失焦保存未提交标题；失败也不移除编辑草稿', async () => {
    boot()
    await app.get('.block-title').trigger('click')
    await flushPromises()
    await app.get('.title-input').setValue('未提交改名')
    await open()
    await app.get('.title-input').trigger('blur')
    await select(backup(incoming))
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    await confirm()
    expect((app.get('.title-input').element as HTMLInputElement).value).toBe('未提交改名')
    expect(stored()).toEqual([old])
    fail.mockRestore()
    await app.get('[aria-label="关闭数据备份"]').trigger('click')
    await flushPromises()
    expect(document.activeElement).toBe(app.get('.title-input').element)
    expect(stored()).toEqual([old])
    await app.get('.title-input').trigger('keydown', { key: 'Escape' })
  })

  it('概览及极夜模式导入后立即更新，主题偏好不受影响，Esc只关闭备份菜单', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    boot()
    await app.get('.view-toggle').trigger('click')
    await open()
    await app.get('#backup-panel').trigger('keydown', { key: 'Escape' })
    expect(app.find('#backup-panel').exists()).toBe(false)
    expect(app.find('[data-testid="day-overview"]').exists()).toBe(true)
    await open()
    await select(backup(incoming))
    await confirm()
    expect(app.get('[data-overview-block-id="new"]').attributes('style')).toContain('#23435A')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
  })
})
