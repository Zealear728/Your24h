import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../src/App.vue'
import DayOverview from '../src/components/DayOverview.vue'
import { localDate, MINUTE_HEIGHT, shiftDate } from '../src/domain/time'
import type { TimeBlock } from '../src/domain/time'
import { STORAGE_KEY } from '../src/domain/storage'

const today = localDate()
const item = (id: string, startMinute: number, endMinute: number, date = today): TimeBlock => ({ id, startMinute, endMinute, date, title: id, color: 'lavender' })
const blocks = [item('八小时', 0, 480), item('两小时', 540, 660), item('半小时', 840, 870), item('睡前', 1410, 1440)]
const rect = (top: number, height: number) => ({ top, bottom: top + height, left: 80, right: 980, width: 900, height, x: 80, y: top, toJSON: () => ({}) })
let app: VueWrapper
let resizeObserver: { callback: ResizeObserverCallback; disconnect: ReturnType<typeof vi.fn> }
const originalResizeObserver = window.ResizeObserver

beforeEach(() => {
  localStorage.clear()
  window.ResizeObserver = class {
    callback: ResizeObserverCallback
    disconnect = vi.fn()
    constructor(callback: ResizeObserverCallback) { this.callback = callback; resizeObserver = this }
    observe() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver
})
afterEach(() => {
  app?.unmount()
  window.ResizeObserver = originalResizeObserver
  document.body.innerHTML = ''
})

async function measure(height: number, top = 100) {
  vi.spyOn(app.get('.overview-layout').element, 'getBoundingClientRect').mockReturnValue(rect(top, height))
  vi.spyOn(app.get('[data-testid="overview-canvas"]').element, 'getBoundingClientRect').mockReturnValue(rect(top, height))
  resizeObserver.callback([], resizeObserver as unknown as ResizeObserver)
  await nextTick()
}
function boot(data: TimeBlock[] = blocks) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  app = mount(App, { attachTo: document.body })
  vi.spyOn(app.get('[data-testid="canvas"]').element, 'getBoundingClientRect').mockReturnValue(rect(0, 1920))
  const scroller = app.get('[data-testid="timeline-scroll"]').element as HTMLElement
  Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 600 })
  return scroller
}
const saved = (): TimeBlock[] => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
async function toggle() { await app.get('.view-toggle').trigger('click'); await flushPromises() }
function pointer(target: EventTarget, type: string, minute: number) {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: 150, clientY: minute * MINUTE_HEIGHT, button: 0, pointerId: 1 }))
}

describe('只读全日概览的比例与容器适配', () => {
  it('00:00–24:00完整映射，8小时、2小时、30分钟比例为16:4:1，不增加最小块高', async () => {
    app = mount(DayOverview, { props: { blocks, theme: 'light', isToday: true, nowMinute: 720 } })
    await measure(720)
    const heights = ['八小时', '两小时', '半小时'].map(id => parseFloat((app.get(`[data-overview-block-id="${id}"]`).element as HTMLElement).style.height))
    expect(heights[0] / heights[2]).toBeCloseTo(16)
    expect(heights[1] / heights[2]).toBeCloseTo(4)
    const labels = app.findAll('.overview-hour')
    expect(labels).toHaveLength(25)
    expect(labels[0].text()).toBe('00:00')
    expect(labels.at(-1)!.text()).toBe('24:00')
    expect((labels[12].element as HTMLElement).style.top).toBe('50%')
    const last = app.get('[data-overview-block-id="睡前"]').element as HTMLElement
    expect(parseFloat(last.style.top) + parseFloat(last.style.height)).toBeCloseTo(100)
    expect(app.get('[data-testid="overview-now"]').attributes('style')).toContain('50%')
  })

  it('容器变矮时隐藏放不下的文字、减少标签，几何比例不变并清理观察器', async () => {
    app = mount(DayOverview, { props: { blocks, theme: 'dark', isToday: false, nowMinute: 720 } })
    await measure(720)
    const twoHours = app.get('[data-overview-block-id="两小时"]')
    const originalStyle = twoHours.attributes('style')
    expect(twoHours.get('.overview-title').text()).toBe('两小时')
    expect(app.get('[data-overview-block-id="半小时"]').find('.overview-title').exists()).toBe(false)
    await measure(240)
    expect(twoHours.find('.overview-title').exists()).toBe(false)
    expect(twoHours.attributes('style')).toBe(originalStyle)
    expect(app.findAll('.overview-hour')).toHaveLength(9)
    expect(app.find('[data-testid="overview-now"]').exists()).toBe(false)
    app.unmount()
    expect(resizeObserver.disconnect).toHaveBeenCalled()
  })

  it.each([240, 480, 720])('高度%s下点击空白，扣除画布位置后定位准确且限制在当天', async height => {
    app = mount(DayOverview, { props: { blocks: [], theme: 'light', isToday: false, nowMinute: 0 } })
    await measure(height, 150)
    const canvas = app.get('[data-testid="overview-canvas"]')
    for (const fraction of [-0.1, 0, 0.5, 1, 1.1]) await canvas.trigger('click', { clientY: 150 + height * fraction })
    expect(app.emitted('locate')!.map(args => args[0])).toEqual([0, 0, 720, 1440, 1440])
  })

  it('块只发出一次定位事件；拖动、Delete不编辑，没有删除、输入、resize或调色操作', async () => {
    app = mount(DayOverview, { props: { blocks, theme: 'dark', isToday: false, nowMinute: 0 } })
    await measure(720)
    const block = app.get('[data-overview-block-id="两小时"]')
    pointer(block.element, 'pointerdown', 540)
    pointer(window, 'pointermove', 720)
    pointer(window, 'pointerup', 720)
    await block.trigger('keydown', { key: 'Delete' })
    expect(app.emitted('locate')).toBeUndefined()
    expect(app.find('input, .resize-handle, .delete-button, .color-palette').exists()).toBe(false)
    await block.get('.overview-title').trigger('click')
    expect(app.emitted('locate')).toEqual([[540]])
    await app.setProps({ theme: 'light' })
    expect(saved()).toEqual([])
    expect((block.element as HTMLElement).style.getPropertyValue('--block-bg')).toBe('#DFD0F4')
  })

  it('支持键盘定位，不使用编辑快捷键修改数据', async () => {
    app = mount(DayOverview, { props: { blocks: [], theme: 'dark', isToday: false, nowMinute: 0 } })
    const canvas = app.get('[data-testid="overview-canvas"]')
    await canvas.trigger('keydown', { key: 'ArrowDown' })
    await canvas.trigger('keydown', { key: 'Enter' })
    expect(app.emitted('locate')).toEqual([[780]])
  })
})

describe('概览与编辑模式往返', () => {
  it('工具栏直接退出恢复准确滚动位置，多次往返不写入任何日程', async () => {
    const scroller = boot()
    scroller.scrollTop = 632.5
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    await toggle()
    expect(app.get('[data-testid="timeline-scroll"]').isVisible()).toBe(false)
    expect(app.get('[data-testid="timeline-scroll"]').attributes('inert')).toBeDefined()
    expect(app.find('[data-testid="day-overview"]').exists()).toBe(true)
    await toggle()
    expect(scroller.scrollTop).toBe(632.5)
    expect(app.get('[data-testid="timeline-scroll"]').isVisible()).toBe(true)
    await toggle()
    await toggle()
    expect(scroller.scrollTop).toBe(632.5)
    expect(writes).not.toHaveBeenCalled()
    expect(saved()).toEqual(blocks)
  })

  it('点击已有块返回附近；点击后的pointerup不误创建，返回后仍可移动和resize', async () => {
    const scroller = boot([item('目标', 840, 960)])
    await toggle()
    await app.get('[data-overview-block-id="目标"]').trigger('click')
    await flushPromises()
    expect(scroller.scrollTop).toBe(840 * MINUTE_HEIGHT - 140)
    pointer(window, 'pointerup', 840)
    expect(app.find('.title-input').exists()).toBe(false)
    const block = app.get('.time-block')
    pointer(block.element, 'pointerdown', 870)
    pointer(window, 'pointerup', 1170)
    await nextTick()
    expect(saved()[0]).toMatchObject({ startMinute: 1140, endMinute: 1260 })
    pointer(app.get('[data-testid="resize-end"]').element, 'pointerdown', 1260)
    pointer(window, 'pointerup', 1320)
    await nextTick()
    expect(saved()[0]).toMatchObject({ startMinute: 1140, endMinute: 1320 })
  })

  it('点击空白只定位，不创建；进入普通模式之后新的单击才创建', async () => {
    const scroller = boot([])
    await toggle()
    await measure(600, 100)
    await app.get('[data-testid="overview-canvas"]').trigger('click', { clientY: 400 })
    await flushPromises()
    expect(scroller.scrollTop).toBe(720 * MINUTE_HEIGHT - 140)
    expect(saved()).toEqual([])
    expect(app.find('.title-input').exists()).toBe(false)
    pointer(app.get('[data-testid="canvas"]').element, 'pointerdown', 720)
    pointer(window, 'pointerup', 720)
    await flushPromises()
    await app.get('.title-input').setValue('定位后新建')
    await app.get('.title-input').trigger('keydown', { key: 'Enter' })
    expect(saved()[0]).toMatchObject({ title: '定位后新建', startMinute: 720, endMinute: 750 })
  })

  it('概览切日期、明暗模式保持只读；恢复对应日期滚动，刷新后数据不变', async () => {
    const original = [...blocks, item('明天', 540, 660, shiftDate(today, 1))]
    const scroller = boot(original)
    scroller.scrollTop = 600
    await toggle()
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    await app.get('[aria-label="后一天"]').trigger('click')
    expect(app.find('[data-testid="day-overview"]').exists()).toBe(true)
    expect(app.findAll('[data-overview-block-id]')).toHaveLength(1)
    expect(app.find('[data-testid="overview-now"]').exists()).toBe(false)
    await app.get('.theme-toggle').trigger('click')
    expect(app.get('[data-overview-block-id="明天"]').attributes('style')).toContain('#37335F')
    await app.get('[aria-label="前一天"]').trigger('click')
    expect(app.find('[data-testid="overview-now"]').exists()).toBe(true)
    await toggle()
    expect(scroller.scrollTop).toBe(600)
    expect(writes.mock.calls.filter(call => call[0] === STORAGE_KEY)).toHaveLength(0)
    expect(saved()).toEqual(original)
    app.unmount()
    boot(saved())
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(saved()).toEqual(original)
    expect(app.find('[data-testid="day-overview"]').exists()).toBe(false)
  })

  it('未提交输入在概览中失焦、切日期也不保存；回来仍可Esc取消', async () => {
    boot([])
    pointer(app.get('[data-testid="canvas"]').element, 'pointerdown', 540)
    pointer(window, 'pointerup', 540)
    await flushPromises()
    await app.get('.title-input').setValue('还没保存')
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    await toggle()
    await app.get('.title-input').trigger('blur')
    await app.get('[aria-label="后一天"]').trigger('click')
    await app.get('[aria-label="前一天"]').trigger('click')
    await toggle()
    expect((app.get('.title-input').element as HTMLInputElement).value).toBe('还没保存')
    expect(writes).not.toHaveBeenCalled()
    await app.get('.title-input').trigger('keydown', { key: 'Escape' })
    expect(app.find('.time-block').exists()).toBe(false)
    expect(saved()).toEqual([])
  })

  it('概览的Esc只退出视图，保留编辑草稿、焦点和文字选区', async () => {
    boot([item('已有', 540, 660)])
    await app.get('.block-title').trigger('click')
    await flushPromises()
    await app.get('.title-input').setValue('未提交的改名')
    const input = app.get('.title-input').element as HTMLInputElement
    input.setSelectionRange(1, 3)
    await toggle()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    await flushPromises()
    expect(app.find('[data-testid="day-overview"]').exists()).toBe(false)
    expect(document.activeElement).toBe(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 3])
    expect(input.value).toBe('未提交的改名')
    expect(saved()[0].title).toBe('已有')
  })

  it('概览里跳到现在回到今天的编辑位置；未浏览过的日期也能合理退出', async () => {
    const scroller = boot([])
    await toggle()
    const minute = app.getComponent(DayOverview).props('nowMinute')
    await app.get('.now-button').trigger('click')
    await flushPromises()
    expect(app.find('[data-testid="day-overview"]').exists()).toBe(false)
    expect(scroller.scrollTop).toBe(Math.max(0, minute * MINUTE_HEIGHT - 140))
    await toggle()
    await app.get('[aria-label="后一天"]').trigger('click')
    await toggle()
    expect(scroller.scrollTop).toBe(480 * MINUTE_HEIGHT - 140)
    expect(saved()).toEqual([])
  })

  it('快速进入、退出、再进入，不让延后的恢复滚动覆盖新视图', async () => {
    const scroller = boot([])
    scroller.scrollTop = 850
    const button = app.get('.view-toggle').element
    for (let index = 0; index < 3; index++) button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await flushPromises()
    expect(app.find('[data-testid="day-overview"]').exists()).toBe(true)
    await toggle()
    expect(scroller.scrollTop).toBe(850)
    expect(saved()).toEqual([])
  })

  it.each(['create', 'move', 'resize'])('进入概览会取消未结束的%s预览，旧pointerup不能提交', async kind => {
    boot([item('已有', 540, 660)])
    const target = kind === 'create' ? app.get('[data-testid="canvas"]') : kind === 'move' ? app.get('.time-block') : app.get('[data-testid="resize-end"]')
    const origin = kind === 'create' ? 840 : kind === 'move' ? 570 : 660
    pointer(target.element, 'pointerdown', origin)
    pointer(window, 'pointermove', origin + 120)
    await toggle()
    pointer(window, 'pointerup', origin + 120)
    await toggle()
    expect(saved()).toEqual([item('已有', 540, 660)])
    expect(app.find('.title-input').exists()).toBe(false)
    expect(app.find('.creation-preview').exists()).toBe(false)
  })
})
