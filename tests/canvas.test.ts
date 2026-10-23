import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import App from '../src/App.vue'
import { MINUTE_HEIGHT, localDate, shiftDate } from '../src/domain/time'
import type { TimeBlock } from '../src/domain/time'
import { STORAGE_KEY } from '../src/domain/storage'
import { THEME_STORAGE_KEY } from '../src/composables/useTheme'

let app: VueWrapper
const today = localDate()
const records = (): TimeBlock[] => JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
const item = (id: string, startMinute: number, endMinute: number, title = id, date = today): TimeBlock => ({ id, startMinute, endMinute, title, date, color: 'sage' })
function boot(items: TimeBlock[] = []) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  app = mount(App, { attachTo: document.body })
  const canvas = app.get('[data-testid="canvas"]').element
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 1920, left: 0, right: 800, width: 800, height: 1920, x: 0, y: 0, toJSON: () => ({}) })
  return canvas
}
function pointer(target: EventTarget, type: string, minute: number, extra: PointerEventInit = {}) {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: 150, clientY: minute * MINUTE_HEIGHT, button: 0, pointerId: 1, ...extra }))
}
async function draw(start: number, end = start) {
  const canvas = app.get('[data-testid="canvas"]').element
  pointer(canvas, 'pointerdown', start)
  pointer(window, 'pointermove', end)
  pointer(window, 'pointerup', end)
  await flushPromises()
}
async function title(text: string, key = 'Enter') {
  await app.get('input[aria-label="时间块标题"]').setValue(text)
  await app.get('input[aria-label="时间块标题"]').trigger('keydown', { key })
  await nextTick()
}
async function drag(id: string, from: number, to: number, edge?: 'start' | 'end') {
  const selector = `[data-block-id="${id}"]${edge ? ` [data-testid="resize-${edge}"]` : ''}`
  pointer(app.get(selector).element, 'pointerdown', from)
  pointer(window, 'pointermove', to)
  await nextTick()
  pointer(window, 'pointerup', to)
  await nextTick()
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  app?.unmount()
  vi.useRealTimers()
  document.body.innerHTML = ''
})

describe('画布DOM交互与持久化', () => {
  it('创建09–11写作业、14–16学Blender和单击30分钟块，并立即聚焦标题', async () => {
    boot()
    await draw(540, 660)
    expect(document.activeElement).toBe(app.get('.title-input').element)
    expect(records()).toEqual([]) // Drafts never enter storage.
    await title('写作业')
    await draw(840, 960)
    await title('学 Blender')
    await draw(725)
    await title('散步')
    expect(records().map(({ title, startMinute, endMinute }) => [title, startMinute, endMinute]))
      .toEqual([['写作业', 540, 660], ['学 Blender', 840, 960], ['散步', 720, 750]])
  })

  it('标题点击修改、空白提交恢复旧标题、Esc取消已有标题编辑', async () => {
    boot([item('one', 540, 660, '写作业')])
    await app.get('.block-title').trigger('click')
    await title('  写数学作业  ')
    expect(records()[0]?.title).toBe('写数学作业')
    await app.get('.block-title').trigger('click')
    await title('   ')
    expect(records()[0]?.title).toBe('写数学作业')
    await app.get('.block-title').trigger('click')
    await title('不保存', 'Escape')
    expect(records()[0]?.title).toBe('写数学作业')
  })

  it('非空标题失焦自动保存，空白新块失焦取消', async () => {
    boot()
    await draw(540, 660)
    await app.get('.title-input').setValue('写作业')
    await app.get('.title-input').trigger('blur')
    expect(records()).toHaveLength(1)
    await draw(840)
    await app.get('.title-input').setValue('  ')
    await app.get('.title-input').trigger('blur')
    expect(records()).toHaveLength(1)
    expect(app.findAll('.time-block')).toHaveLength(1)
  })

  it('中文输入法选词Enter不提交，输入框不会启动拖动', async () => {
    boot()
    await draw(540)
    await app.get('.title-input').setValue('写作业')
    await app.get('.title-input').trigger('keydown', { key: 'Enter', isComposing: true })
    expect(records()).toHaveLength(0)
    pointer(app.get('.title-input').element, 'pointerdown', 550)
    pointer(window, 'pointermove', 900)
    pointer(window, 'pointerup', 900)
    await nextTick()
    expect(app.find('.creation-preview').exists()).toBe(false)
    await title('写作业')
    expect(records()[0]?.startMinute).toBe(540)
  })

  it('Esc取消新建无空白残留，也不在刷新后出现', async () => {
    boot()
    await draw(540, 660)
    await title('还没决定', 'Escape')
    expect(records()).toEqual([])
    expect(app.find('.time-block').exists()).toBe(false)
    app.unmount()
    boot(records())
    expect(app.find('.time-block').exists()).toBe(false)
  })

  it('把Blender移到19–21，按下时不跳动，持续时间不变', async () => {
    boot([item('blender', 840, 960, '学 Blender')])
    pointer(app.get('.time-block').element, 'pointerdown', 880)
    await nextTick()
    expect(records()[0]).toMatchObject({ startMinute: 840, endMinute: 960 })
    expect((app.get('.time-block').element as HTMLElement).style.top).toBe(`${840 * MINUTE_HEIGHT}px`)
    pointer(window, 'pointermove', 1180)
    await nextTick()
    expect((app.get('.time-block').element as HTMLElement).style.top).toBe(`${1140 * MINUTE_HEIGHT}px`)
    expect(records()[0]?.startMinute).toBe(840) // Preview does not save.
    pointer(window, 'pointerup', 1180)
    await nextTick()
    expect(records()[0]).toMatchObject({ startMinute: 1140, endMinute: 1260 })
  })

  it('上下边缘调整、遇到邻居停止，支持相邻半开区间', async () => {
    boot([item('one', 840, 960), item('before', 720, 780), item('after', 1020, 1080)])
    await drag('one', 840, 500, 'start')
    expect(records().find(x => x.id === 'one')).toMatchObject({ startMinute: 780, endMinute: 960 })
    await drag('one', 960, 1200, 'end')
    expect(records().find(x => x.id === 'one')).toMatchObject({ startMinute: 780, endMinute: 1020 })
    await drag('one', 780, 1300, 'start')
    expect(records().find(x => x.id === 'one')).toMatchObject({ startMinute: 990, endMinute: 1020 })
  })

  it('移动冲突有明确反馈，松手恢复，不写入冲突数据', async () => {
    boot([item('one', 540, 660), item('two', 840, 960)])
    pointer(app.get('[data-block-id="one"]').element, 'pointerdown', 570)
    pointer(window, 'pointermove', 870)
    await nextTick()
    expect(app.get('[data-block-id="one"]').classes()).toContain('is-invalid')
    expect(app.text()).toContain('此处已有安排')
    pointer(window, 'pointerup', 870)
    await nextTick()
    expect(records()[0]).toMatchObject({ startMinute: 540, endMinute: 660 })
    expect(app.text()).toContain('已回到原位')
  })

  it('创建不能穿过已有块，底向上拖动同样有效', async () => {
    boot([item('occupied', 840, 960)])
    await draw(720, 1100)
    await title('邻接')
    expect(records()[1]).toMatchObject({ startMinute: 720, endMinute: 840 })
    await draw(660, 540)
    await title('反向创建')
    expect(records()[2]).toMatchObject({ startMinute: 540, endMinute: 660 })
    await draw(850, 1100)
    expect(app.find('.title-input').exists()).toBe(false)
    expect(records()).toHaveLength(3)
  })

  it('00:00和24:00边界创建、移动与调整都不越界', async () => {
    boot()
    await draw(0)
    await title('午夜')
    await draw(1440)
    await title('睡前')
    expect(records().map(x => [x.startMinute, x.endMinute])).toEqual([[0, 30], [1410, 1440]])
    const first = records()[0]!.id
    await drag(first, 10, -200)
    expect(records()[0]).toMatchObject({ startMinute: 0, endMinute: 30 })
    const last = records()[1]!.id
    await drag(last, 1440, 2000, 'end')
    expect(records()[1]).toMatchObject({ startMinute: 1410, endMinute: 1440 })
  })

  it('刷新恢复标题、日期、时间和颜色，明天与今天互不影响', async () => {
    boot([item('today', 540, 660, '写作业')])
    await app.get('[aria-label="更换 写作业 的颜色"]').trigger('click')
    await app.get('[aria-label="薰衣草"]').trigger('click')
    await app.get('[aria-label="后一天"]').trigger('click')
    await flushPromises()
    expect(app.find('.now-line').exists()).toBe(false)
    expect(app.find('.time-block').exists()).toBe(false)
    await draw(540, 660)
    await title('明天的安排')
    expect(records()[1]?.date).toBe(shiftDate(today, 1))
    await app.get('[aria-label="前一天"]').trigger('click')
    await flushPromises()
    expect(app.get('.block-title').text()).toBe('写作业')
    expect(app.get('.time-block').classes()).toContain('color-lavender')
    const persisted = records()
    app.unmount()
    boot(persisted)
    expect(app.get('.block-title').text()).toBe('写作业')
    expect(records()).toEqual(persisted)
  })

  it('删除直接持久化，不触发创建或拖动', async () => {
    boot([item('one', 540, 660, '写作业')])
    pointer(app.get('[aria-label="删除 写作业"]').element, 'pointerdown', 560)
    pointer(window, 'pointerup', 560)
    await app.get('[aria-label="删除 写作业"]').trigger('click')
    expect(records()).toEqual([])
    expect(app.find('.creation-preview').exists()).toBe(false)
  })

  it.each(['pointercancel', 'lostpointercapture'])('%s取消创建与移动，不写入预览', async eventType => {
    const canvas = boot([item('one', 540, 660)])
    pointer(canvas, 'pointerdown', 840)
    pointer(window, 'pointermove', 960)
    pointer(eventType === 'lostpointercapture' ? canvas : window, eventType, 960)
    pointer(window, 'pointerup', 960)
    await nextTick()
    expect(app.find('.title-input').exists()).toBe(false)
    pointer(app.get('.time-block').element, 'pointerdown', 560)
    pointer(window, 'pointermove', 860)
    pointer(eventType === 'lostpointercapture' ? canvas : window, eventType, 860)
    pointer(window, 'pointerup', 860)
    await nextTick()
    expect(records()[0]).toMatchObject({ startMinute: 540, endMinute: 660 })
  })

  it('Esc、窗口失焦或切换日期中断拖动并保留原始数据', async () => {
    boot([item('one', 540, 660)])
    for (const cancel of ['escape', 'blur', 'date']) {
      pointer(app.get('.time-block').element, 'pointerdown', 560)
      pointer(window, 'pointermove', 860)
      if (cancel === 'escape') window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      if (cancel === 'blur') window.dispatchEvent(new Event('blur'))
      if (cancel === 'date') await app.get('[aria-label="后一天"]').trigger('click')
      pointer(window, 'pointerup', 860)
      await nextTick()
      expect(records()[0]).toMatchObject({ startMinute: 540, endMinute: 660 })
    }
  })

  it('6px以内轻微手抖仍按单击创建，不保存第二指针的事件', async () => {
    const canvas = boot()
    pointer(canvas, 'pointerdown', 869)
    pointer(window, 'pointermove', 1200, { pointerId: 2 })
    pointer(window, 'pointerup', 1200, { pointerId: 2 })
    pointer(window, 'pointerup', 872) // Four physical pixels from origin.
    await flushPromises()
    await title('单击')
    expect(records()[0]).toMatchObject({ startMinute: 840, endMinute: 870 })
  })

  it('右键不创建；鼠标在画布外松开也结束操作', async () => {
    const canvas = boot()
    pointer(canvas, 'pointerdown', 540, { button: 2 })
    pointer(window, 'pointerup', 540, { button: 2 })
    await nextTick()
    expect(app.find('.title-input').exists()).toBe(false)
    pointer(canvas, 'pointerdown', 540)
    pointer(window, 'pointerup', 660, { clientX: 2000 })
    await flushPromises()
    await title('画布外释放')
    expect(records()[0]).toMatchObject({ startMinute: 540, endMinute: 660 })
  })

  it('键盘可以创建、移动、调整和删除', async () => {
    boot()
    await app.get('[data-testid="canvas"]').trigger('keydown', { key: 'Enter' })
    await flushPromises()
    await title('键盘安排')
    const grip = app.get('.block-grip')
    await grip.trigger('keydown', { key: 'ArrowDown' })
    expect(records()[0]).toMatchObject({ startMinute: 570, endMinute: 600 })
    await grip.trigger('keydown', { key: 'ArrowDown', shiftKey: true })
    expect(records()[0]).toMatchObject({ startMinute: 570, endMinute: 630 })
    await grip.trigger('keydown', { key: 'ArrowUp', shiftKey: true, altKey: true })
    expect(records()[0]).toMatchObject({ startMinute: 540, endMinute: 630 })
    await grip.trigger('keydown', { key: 'Delete' })
    expect(records()).toEqual([])
  })

  it('存储写入失败显示提示，恢复权限后可以重试保存', async () => {
    boot()
    const fail = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    await draw(540)
    await title('暂未保存')
    expect(app.text()).toContain('暂时无法保存')
    expect(app.get('.storage-state').text()).toContain('尚未保存')
    fail.mockRestore()
    await app.get('.notice button').trigger('click')
    expect(records()[0]?.title).toBe('暂未保存')
    expect(app.find('.notice').exists()).toBe(false)
  })

  it('拖到滚动区边缘自动滚动，按滚动后的画布坐标更新选区', async () => {
    const canvas = boot() as HTMLElement
    const scroller = app.get('[data-testid="timeline-scroll"]').element as HTMLElement
    scroller.scrollTop = 0
    vi.spyOn(canvas, 'getBoundingClientRect').mockImplementation(() => ({ top: -scroller.scrollTop, bottom: 1920 - scroller.scrollTop, left: 0, right: 800, width: 800, height: 1920, x: 0, y: -scroller.scrollTop, toJSON: () => ({}) }))
    vi.spyOn(scroller, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 600, left: 0, right: 800, width: 800, height: 600, x: 0, y: 0, toJSON: () => ({}) })
    let frame: FrameRequestCallback | undefined
    vi.mocked(requestAnimationFrame).mockImplementationOnce(callback => { frame = callback; return 1 })
    pointer(canvas, 'pointerdown', 300)
    pointer(window, 'pointermove', 460)
    frame!(0)
    await nextTick()
    expect(scroller.scrollTop).toBeGreaterThan(0)
    expect(app.get('.selection-label').text()).toContain('08:00')
    pointer(window, 'pointerup', 460)
    await flushPromises()
    await title('边缘自动滚动')
    expect(records()[0]).toMatchObject({ startMinute: 300, endMinute: 480 })
  })

  it('时间线随真实时间更新，午夜后不在昨天继续显示', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] })
    vi.setSystemTime(new Date(2026, 9, 15, 23, 59, 45))
    boot()
    expect(app.get('.now-time').text()).toBe('23:59')
    vi.advanceTimersByTime(15_000)
    await nextTick()
    expect(app.find('.now-line').exists()).toBe(false)
    await app.get('.today-button').trigger('click')
    await nextTick()
    expect(app.get('.now-time').text()).toBe('00:00')
  })

  it('连续保存的新块轮换颜色，取消或提交空标题不占用颜色', async () => {
    boot()
    for (let index = 0; index < 6; index++) {
      await draw(480 + index * 60)
      await title('取消', 'Escape')
      await draw(480 + index * 60)
      await title('  ')
      await draw(480 + index * 60)
      await title(`安排 ${index}`)
    }
    expect(records().map(block => block.color)).toEqual(['sage', 'lavender', 'sky', 'peach', 'rose', 'sage'])
    expect(app.get('[data-block-id="' + records()[4].id + '"]').element.getAttribute('style')).toContain('#F1CFD8')
  })

  it('按创建顺序配色，跨日和刷新接续轮换，手动颜色在编辑移动后保持', async () => {
    boot()
    await draw(1140)
    await title('先建晚上')
    await draw(540)
    await title('后建早上')
    expect(records().map(block => block.color)).toEqual(['sage', 'lavender'])
    await app.get('[aria-label="更换 后建早上 的颜色"]').trigger('click')
    await app.get('[aria-label="玫瑰"]').trigger('click')
    const secondId = records()[1].id
    await drag(secondId, 550, 610)
    await app.get(`[data-block-id="${secondId}"] .block-title`).trigger('click')
    await title('手动粉色')
    expect(records()[1]).toMatchObject({ color: 'rose', startMinute: 600 })
    const saved = records()
    app.unmount()
    boot(saved)
    await app.get('[aria-label="后一天"]').trigger('click')
    await flushPromises()
    await draw(540)
    await title('明天')
    expect(records().slice(0, 2)).toEqual(saved)
    expect(records()[2]).toMatchObject({ date: shiftDate(today, 1), color: 'sage' })
    await app.get('[aria-label="前一天"]').trigger('click')
    await flushPromises()
    expect(records().slice(0, 2)).toEqual(saved)
  })

  it('旧燕麦保持原色；打开页面与切换日期不会重写已有数据', async () => {
    const blocks: TimeBlock[] = [{ ...item('old', 540, 570), color: 'neutral' }]
    boot(blocks)
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    expect((app.get('.time-block').element as HTMLElement).style.getPropertyValue('--block-bg')).toBe('#EEECE4')
    await app.get('[aria-label="后一天"]').trigger('click')
    await app.get('[aria-label="前一天"]').trigger('click')
    await flushPromises()
    expect(writes).not.toHaveBeenCalled()
    expect(records()).toEqual(blocks)
    await draw(600)
    await title('新绿')
    expect(records()[0]).toEqual(blocks[0])
    expect(records()[1].color).toBe('sage')
  })

  it.each([
    { viewport: '1920×1080', top: 210, left: 96, width: 1728 },
    { viewport: '1440×900', top: 180, left: 72, width: 1296 },
    { viewport: '1024px', top: 150, left: 24, width: 976 },
    { viewport: '480px', top: 240, left: 10, width: 460 },
  ])('$viewport 模拟不同画布位置和宽度，创建、移动、resize保持时间计算正确', async ({ top, left, width }) => {
    const canvas = boot()
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ top, bottom: top + 1920, left, right: left + width, width, height: 1920, x: left, y: top, toJSON: () => ({}) })
    const at = (target: EventTarget, event: string, minute: number) => pointer(target, event, minute, { clientY: top + minute * MINUTE_HEIGHT, clientX: left + width / 2 })
    at(canvas, 'pointerdown', 540)
    at(window, 'pointermove', 660)
    at(window, 'pointerup', 660)
    await flushPromises()
    await title('位置变化')
    expect(records()[0]).toMatchObject({ startMinute: 540, endMinute: 660 })
    at(app.get('.time-block').element, 'pointerdown', 570)
    at(window, 'pointermove', 870)
    at(window, 'pointerup', 870)
    await nextTick()
    expect(records()[0]).toMatchObject({ startMinute: 840, endMinute: 960 })
    at(app.get('[data-testid="resize-end"]').element, 'pointerdown', 960)
    at(window, 'pointerup', 1020)
    await nextTick()
    expect(records()[0]).toMatchObject({ startMinute: 840, endMinute: 1020 })
  })

  it('半小时块紧凑显示，编辑与resize不改变时间到像素的映射', async () => {
    boot([item('short', 540, 570, '一个很长很长的半小时时间块标题')])
    expect(app.get('.time-block').classes()).toContain('is-compact')
    expect((app.get('.time-block').element as HTMLElement).style.height).toBe('37px')
    expect(app.get('.block-title').attributes('title')).toContain('09:00 → 09:30')
    await app.get('.block-title').trigger('click')
    await title('改标题')
    expect((app.get('.time-block').element as HTMLElement).style.height).toBe('37px')
    await drag('short', 570, 600, 'end')
    expect(app.get('.time-block').classes()).not.toContain('is-compact')
    expect((app.get('.time-block').element as HTMLElement).style.height).toBe('77px')
    expect(records()[0]).toMatchObject({ startMinute: 540, endMinute: 600, color: 'sage' })
  })

  it('鼠标切换主题保留新建输入框、焦点、选区和未提交标题，不改日程存储', async () => {
    boot()
    await draw(540)
    const input = app.get('.title-input').element as HTMLInputElement
    await app.get('.title-input').setValue('正在编辑中文标题')
    input.setSelectionRange(2, 5)
    const scroller = app.get('[data-testid="timeline-scroll"]').element
    scroller.scrollTop = 160
    const writes = vi.spyOn(Storage.prototype, 'setItem')
    const down = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 })
    app.get('.theme-toggle').element.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)
    await app.get('.theme-toggle').trigger('click')
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(app.get('.theme-toggle').attributes('aria-pressed')).toBe('true')
    expect(app.get('.title-input').element).toBe(input)
    expect(document.activeElement).toBe(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5])
    expect(input.value).toBe('正在编辑中文标题')
    expect(scroller.scrollTop).toBe(160)
    expect(records()).toEqual([])
    expect(writes).toHaveBeenCalledExactlyOnceWith(THEME_STORAGE_KEY, 'dark')
    await title('正在编辑中文标题')
    expect(records()[0]).toMatchObject({ title: '正在编辑中文标题', startMinute: 540, endMinute: 570, color: 'sage' })
  })

  it('已有标题切换明暗后仍能Esc取消，日程数据与颜色完全不变', async () => {
    boot([{ ...item('old', 540, 660, '旧标题'), color: 'neutral' }])
    const before = localStorage.getItem(STORAGE_KEY)
    await app.get('.block-title').trigger('click')
    await app.get('.title-input').setValue('还没决定')
    await app.get('.theme-toggle').trigger('click')
    expect((app.get('.time-block').element as HTMLElement).style.getPropertyValue('--block-bg')).toBe('#423E35')
    await app.get('.theme-toggle').trigger('click')
    expect((app.get('.time-block').element as HTMLElement).style.getPropertyValue('--block-bg')).toBe('#EEECE4')
    await app.get('.title-input').trigger('keydown', { key: 'Escape' })
    expect(app.get('.block-title').text()).toBe('旧标题')
    expect(localStorage.getItem(STORAGE_KEY)).toBe(before)
  })

  it('拖动选区中切换主题不取消手势，松手仍可正常输入保存', async () => {
    const canvas = boot()
    pointer(canvas, 'pointerdown', 540)
    pointer(window, 'pointermove', 660)
    await nextTick()
    await app.get('.theme-toggle').trigger('click')
    expect(app.get('.selection-label').text()).toContain('09:00 → 11:00')
    expect((app.get('.creation-preview').element as HTMLElement).style.getPropertyValue('--block-bg')).toBe('#364333')
    pointer(window, 'pointerup', 660)
    await flushPromises()
    await title('夜间写作业')
    expect(records()[0]).toMatchObject({ startMinute: 540, endMinute: 660, color: 'sage' })
  })

  it('深色下移动、resize、冲突回退、调色板和跨日保存继续正常', async () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    boot([item('one', 540, 660, '写作业'), item('two', 840, 960, 'Blender')])
    expect(document.documentElement.dataset.theme).toBe('dark')
    await drag('one', 570, 870)
    expect(records()[0]).toMatchObject({ startMinute: 540, endMinute: 660 })
    await drag('two', 870, 1170)
    expect(records()[1]).toMatchObject({ startMinute: 1140, endMinute: 1260 })
    await drag('two', 1260, 1320, 'end')
    expect(records()[1]).toMatchObject({ startMinute: 1140, endMinute: 1320 })
    await app.get('[aria-label="更换 Blender 的颜色"]').trigger('click')
    expect((app.get('[aria-label="晴空"]').element as HTMLElement).style.getPropertyValue('--block-bg')).toBe('#30434E')
    await app.get('.theme-toggle').trigger('click')
    expect(app.find('.color-palette').exists()).toBe(true)
    expect((app.get('[aria-label="晴空"]').element as HTMLElement).style.getPropertyValue('--block-bg')).toBe('#BFDFF0')
    await app.get('.theme-toggle').trigger('click')
    await app.get('[aria-label="晴空"]').trigger('click')
    expect(records()[1].color).toBe('sky')
    const before = records()
    await app.get('[aria-label="后一天"]').trigger('click')
    await app.get('[aria-label="前一天"]').trigger('click')
    expect(records()).toEqual(before)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
