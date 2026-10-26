import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { clamp, DAY_MINUTES, isDateKey, MINUTE_HEIGHT } from '../domain/time'
import type { useCanvas } from './useCanvas'

/** View-only state; never commits blocks or stores a new data field. */
export function useDayView(canvas: ReturnType<typeof useCanvas>) {
  const isOverview = ref(false)
  const scrollPositions = new Map<string, number>()
  let navigation = 0

  async function leaveOverview(minute?: number) {
    const date = canvas.selectedDate.value
    const request = ++navigation
    isOverview.value = false
    await nextTick()
    if (request !== navigation || isOverview.value || date !== canvas.selectedDate.value) return
    const scroller = canvas.scroller.value
    if (!scroller) return
    const offset = Math.min(140, scroller.clientHeight > 0 ? scroller.clientHeight / 3 : 140)
    scroller.scrollTop = minute === undefined
      ? scrollPositions.get(date) ?? Math.max(0, (canvas.isToday.value ? canvas.nowMinute.value : 480) * MINUTE_HEIGHT - offset)
      : Math.max(0, clamp(minute, 0, DAY_MINUTES) * MINUTE_HEIGHT - offset)
    if (minute !== undefined) canvas.keyboardMinute.value = clamp(Math.floor(minute / 30) * 30, 0, DAY_MINUTES - 30)
    if (!canvas.editor.value || canvas.editor.value.block.date !== date) canvas.canvas.value?.focus({ preventScroll: true })
  }

  function toggleView() {
    if (isOverview.value) return leaveOverview()
    ++navigation
    scrollPositions.set(canvas.selectedDate.value, canvas.scroller.value?.scrollTop ?? 0)
    canvas.stopGesture()
    canvas.paletteId.value = null
    isOverview.value = true
  }

  function changeDate(date: string) {
    if (!isDateKey(date)) return
    ++navigation
    if (isOverview.value) {
      // Keep an unfinished editor suspended; browsing the overview must not save it.
      canvas.selectedDate.value = date
    } else return canvas.changeDate(date)
  }

  function jumpToNow() {
    if (!canvas.isToday.value) return
    if (isOverview.value) return leaveOverview(canvas.nowMinute.value)
    canvas.jumpToNow()
  }

  function escape(event: KeyboardEvent) {
    if (!isOverview.value || event.key !== 'Escape') return
    event.preventDefault()
    event.stopImmediatePropagation()
    void leaveOverview()
  }
  onMounted(() => window.addEventListener('keydown', escape, true))
  onBeforeUnmount(() => window.removeEventListener('keydown', escape, true))

  return { isOverview, toggleView, leaveOverview, changeDate, jumpToNow }
}
