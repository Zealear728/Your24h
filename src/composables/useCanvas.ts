import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  canPlace, clamp, creationRange, DAY_MINUTES, DRAG_THRESHOLD, formatRange, isDateKey,
  localDate, MINUTE_HEIGHT, movedRange, resizedRange, shiftDate,
} from '../domain/time'
import type { TimeBlock, TimeRange } from '../domain/time'
import { nextBlockColor } from '../domain/palette'
import type { BlockColor } from '../domain/palette'
import { loadBlocks, saveBlocks } from '../domain/storage'

type GestureKind = 'create' | 'move' | 'start' | 'end'
interface Gesture {
  kind: GestureKind
  pointerId: number
  originX: number
  originY: number
  originMinute: number
  lastX: number
  lastY: number
  active: boolean
  block?: TimeBlock
  preview: TimeRange
  invalid: boolean
}

interface Editor {
  block: TimeBlock
  isNew: boolean
  text: string
}

export function useCanvas() {
  // Accessing localStorage itself may throw in privacy-restricted browsers.
  let storage: Storage | undefined
  try { storage = window.localStorage } catch { /* Show the same unavailable-storage notice below. */ }
  const loaded = storage ? loadBlocks(storage) : { blocks: [], warning: '浏览器不允许本地存储，刷新后安排会丢失。' }
  const blocks = ref<TimeBlock[]>(loaded.blocks)
  const notice = ref(loaded.warning)
  const saved = ref(Boolean(storage))
  const now = ref(new Date())
  const selectedDate = ref(localDate(now.value))
  const canvas = ref<HTMLElement | null>(null)
  const scroller = ref<HTMLElement | null>(null)
  const editor = ref<Editor | null>(null)
  const gesture = ref<Gesture | null>(null)
  const paletteId = ref<string | null>(null)
  const feedback = ref('')
  const keyboardMinute = ref(9 * 60)
  let timer: ReturnType<typeof setInterval> | undefined
  let feedbackTimer: ReturnType<typeof setTimeout> | undefined
  let scrollFrame = 0

  const isToday = computed(() => selectedDate.value === localDate(now.value))
  const dayBlocks = computed(() => blocks.value.filter(block => block.date === selectedDate.value).sort((a, b) => a.startMinute - b.startMinute))
  const visibleBlocks = computed(() => {
    const list = [...dayBlocks.value]
    if (editor.value?.isNew) list.push(editor.value.block)
    return list.map(block => gesture.value?.block?.id === block.id && gesture.value.active
      ? { ...block, ...gesture.value.preview } : block)
  })
  const nowMinute = computed(() => now.value.getHours() * 60 + now.value.getMinutes() + now.value.getSeconds() / 60)
  const dateLabel = computed(() => new Date(`${selectedDate.value}T12:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' }))
  const weekday = computed(() => new Date(`${selectedDate.value}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'long' }))
  const yearLabel = computed(() => selectedDate.value.slice(0, 4))

  watch(blocks, value => {
    saved.value = Boolean(storage && saveBlocks(storage, value))
    if (!saved.value) notice.value = '暂时无法保存到浏览器。请先保留此页面，允许本地存储或腾出空间后重试。'
  }, { deep: true, flush: 'sync' })

  function announce(message: string) {
    feedback.value = message
    clearTimeout(feedbackTimer)
    feedbackTimer = setTimeout(() => { feedback.value = '' }, 3000)
  }

  function retrySave() {
    try { storage = window.localStorage } catch { storage = undefined }
    saved.value = Boolean(storage && saveBlocks(storage, blocks.value))
    if (saved.value) notice.value = ''
  }

  function finishEdit(cancel = false) {
    const current = editor.value
    if (!current) return
    editor.value = null
    if (cancel) return
    const title = current.text.trim()
    if (!title) return
    const block = { ...current.block, title }
    if (!canPlace(block, blocks.value, block.date, current.isNew ? undefined : block.id)) return
    if (current.isNew) blocks.value = [...blocks.value, block]
    else blocks.value = blocks.value.map(item => item.id === block.id ? block : item)
  }

  function editBlock(block: TimeBlock) {
    if (gesture.value || editor.value?.block.id === block.id) return
    finishEdit()
    paletteId.value = null
    editor.value = { block: { ...block }, isNew: false, text: block.title }
  }

  function newBlock(range: TimeRange) {
    if (!canPlace(range, blocks.value, selectedDate.value)) return
    const block: TimeBlock = {
      ...range, id: crypto.randomUUID(), date: selectedDate.value, title: '', color: nextBlockColor(blocks.value),
    }
    editor.value = { block, isNew: true, text: '' }
  }

  function removeBlock(id: string) {
    if (editor.value?.block.id === id) editor.value = null
    paletteId.value = null
    blocks.value = blocks.value.filter(block => block.id !== id)
    announce('时间块已删除')
  }

  function setColor(id: string, color: BlockColor) {
    blocks.value = blocks.value.map(block => block.id === id ? { ...block, color } : block)
    paletteId.value = null
  }

  function pointerMinute(clientY: number) {
    return clamp((clientY - (canvas.value?.getBoundingClientRect().top ?? 0)) / MINUTE_HEIGHT, 0, DAY_MINUTES)
  }

  function startGesture(event: PointerEvent, kind: GestureKind, block?: TimeBlock) {
    if (event.button !== 0 || event.isPrimary === false || gesture.value) return
    if (kind !== 'create' && editor.value?.block.id === block?.id) return
    finishEdit()
    paletteId.value = null
    const minute = pointerMinute(event.clientY)
    const preview = block ? { startMinute: block.startMinute, endMinute: block.endMinute }
      : creationRange(minute, minute, false, dayBlocks.value)
    if (!preview) return
    event.preventDefault()
    gesture.value = {
      kind, pointerId: event.pointerId, originX: event.clientX, originY: event.clientY,
      lastX: event.clientX, lastY: event.clientY, originMinute: minute,
      active: false, block: block ? { ...block } : undefined, preview, invalid: false,
    }
    canvas.value?.setPointerCapture(event.pointerId)
    scrollFrame = requestAnimationFrame(autoScroll)
  }

  function startBlank(event: PointerEvent) {
    if (event.target !== event.currentTarget) return
    startGesture(event, 'create')
  }

  function updateGesture(clientX: number, clientY: number) {
    const current = gesture.value
    if (!current) return
    current.lastX = clientX
    current.lastY = clientY
    if (Math.hypot(clientX - current.originX, clientY - current.originY) >= DRAG_THRESHOLD) current.active = true
    if (!current.active) return
    const minute = pointerMinute(clientY)
    if (current.kind === 'create') {
      const range = creationRange(current.originMinute, minute, true, dayBlocks.value)
      if (range) current.preview = range
    } else if (current.block) {
      current.preview = current.kind === 'move'
        ? movedRange(current.block, minute - current.originMinute)
        : resizedRange(current.block, current.kind, minute - current.originMinute, dayBlocks.value)
      current.invalid = !canPlace(current.preview, blocks.value, selectedDate.value, current.block.id)
    }
  }

  function pointerMove(event: PointerEvent) {
    if (event.pointerId !== gesture.value?.pointerId) return
    updateGesture(event.clientX, event.clientY)
  }

  function stopGesture() {
    const current = gesture.value
    gesture.value = null
    cancelAnimationFrame(scrollFrame)
    if (current && canvas.value?.hasPointerCapture(current.pointerId)) canvas.value.releasePointerCapture(current.pointerId)
    return current
  }

  function pointerUp(event: PointerEvent) {
    if (event.pointerId !== gesture.value?.pointerId) return
    updateGesture(event.clientX, event.clientY)
    const current = stopGesture()
    if (!current) return
    if (current.kind === 'create') newBlock(current.preview)
    else if (current.active && current.block) {
      if (current.invalid) announce('这里已有安排，已回到原位')
      else {
        blocks.value = blocks.value.map(block => block.id === current.block!.id ? { ...block, ...current.preview } : block)
        announce(formatRange(current.preview))
      }
    }
  }

  function pointerCancel(event: PointerEvent) {
    if (event.pointerId === gesture.value?.pointerId) stopGesture()
  }

  function autoScroll() {
    const current = gesture.value
    const element = scroller.value
    if (!current || !element) return
    if (current.active) {
      const rect = element.getBoundingClientRect()
      const edge = 52
      const velocity = current.lastY < rect.top + edge
        ? -clamp((rect.top + edge - current.lastY) / 5, 0, 14)
        : current.lastY > rect.bottom - edge ? clamp((current.lastY - rect.bottom + edge) / 5, 0, 14) : 0
      if (velocity) {
        element.scrollTop += velocity
        updateGesture(current.lastX, current.lastY)
      }
    }
    scrollFrame = requestAnimationFrame(autoScroll)
  }

  function jumpToNow() {
    if (!isToday.value) return
    if (scroller.value) scroller.value.scrollTop = Math.max(0, nowMinute.value * MINUTE_HEIGHT - 140)
  }

  async function changeDate(date: string) {
    if (!isDateKey(date)) return
    finishEdit()
    stopGesture()
    paletteId.value = null
    selectedDate.value = date
    await nextTick()
    if (isToday.value) jumpToNow()
    else if (scroller.value) scroller.value.scrollTop = 8 * 60 * MINUTE_HEIGHT
  }

  function keydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return
    if (event.key === 'Escape') {
      stopGesture()
      finishEdit(true)
      paletteId.value = null
    }
  }

  function canvasKeydown(event: KeyboardEvent) {
    if (event.target !== canvas.value || gesture.value) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      keyboardMinute.value = clamp(keyboardMinute.value + (event.key === 'ArrowDown' ? 30 : -30), 0, DAY_MINUTES - 30)
      const top = keyboardMinute.value * MINUTE_HEIGHT
      if (scroller.value) {
        if (top < scroller.value.scrollTop) scroller.value.scrollTop = top
        else if (top + 40 > scroller.value.scrollTop + scroller.value.clientHeight) scroller.value.scrollTop = top + 40 - scroller.value.clientHeight
      }
    } else if (event.key === 'Enter') {
      event.preventDefault()
      finishEdit()
      const range = creationRange(keyboardMinute.value, keyboardMinute.value, false, dayBlocks.value)
      if (range) newBlock(range)
      else announce('这个时间已有安排，请用方向键选择空白时间')
    }
  }

  function blockKeydown(event: KeyboardEvent, block: TimeBlock) {
    if (!['ArrowUp', 'ArrowDown', 'Delete', 'Backspace'].includes(event.key) || gesture.value || editor.value) return
    event.preventDefault()
    if (event.key === 'Delete' || event.key === 'Backspace') { removeBlock(block.id); return }
    const delta = event.key === 'ArrowDown' ? 30 : -30
    const range = event.shiftKey ? resizedRange(block, event.altKey ? 'start' : 'end', delta, dayBlocks.value) : movedRange(block, delta)
    if (canPlace(range, blocks.value, block.date, block.id)) {
      blocks.value = blocks.value.map(item => item.id === block.id ? { ...item, ...range } : item)
      announce(formatRange(range))
    } else announce('这里已有安排，时间未改变')
  }

  function windowBlur() { stopGesture() }
  function visibilityChange() {
    if (document.hidden) stopGesture()
    else now.value = new Date()
  }

  onMounted(() => {
    jumpToNow()
    timer = setInterval(() => { now.value = new Date() }, 15_000)
    window.addEventListener('pointermove', pointerMove)
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('pointercancel', pointerCancel)
    window.addEventListener('keydown', keydown)
    window.addEventListener('blur', windowBlur)
    document.addEventListener('visibilitychange', visibilityChange)
  })

  onBeforeUnmount(() => {
    stopGesture()
    clearInterval(timer)
    clearTimeout(feedbackTimer)
    window.removeEventListener('pointermove', pointerMove)
    window.removeEventListener('pointerup', pointerUp)
    window.removeEventListener('pointercancel', pointerCancel)
    window.removeEventListener('keydown', keydown)
    window.removeEventListener('blur', windowBlur)
    document.removeEventListener('visibilitychange', visibilityChange)
  })

  return {
    canvas, scroller, blocks, editor, gesture, paletteId, notice, saved, feedback, now, selectedDate,
    isToday, nowMinute, dayBlocks, visibleBlocks, dateLabel, weekday, yearLabel, keyboardMinute,
    finishEdit, editBlock, removeBlock, setColor, startBlank, startGesture, pointerCancel, jumpToNow,
    changeDate, shiftDate, localDate, canvasKeydown, blockKeydown, retrySave,
  }
}
