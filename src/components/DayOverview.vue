<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { colorStyle } from '../domain/palette'
import { clamp, DAY_MINUTES, formatRange, formatTime } from '../domain/time'
import type { TimeBlock } from '../domain/time'
import type { Theme } from '../composables/useTheme'

const props = defineProps<{ blocks: TimeBlock[]; theme: Theme; isToday: boolean; nowMinute: number }>()
const emit = defineEmits<{ locate: [minute: number] }>()
const layout = ref<HTMLElement | null>(null)
const height = ref(240)
const keyboardMinute = ref(720)
const hours = Array.from({ length: 25 }, (_, hour) => hour)
const hourStep = computed(() => height.value >= 480 ? 1 : height.value >= 300 ? 2 : 3)
const percent = (minute: number) => `${minute / DAY_MINUTES * 100}%`
let observer: ResizeObserver | undefined

function measure() {
  const measured = layout.value?.getBoundingClientRect().height ?? 0
  if (measured > 0) height.value = measured
}

function locateBlank(event: MouseEvent) {
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
  if (rect.height <= 0) return
  emit('locate', clamp((event.clientY - rect.top) / rect.height * DAY_MINUTES, 0, DAY_MINUTES))
}

function keydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    keyboardMinute.value = clamp(keyboardMinute.value + (event.key === 'ArrowDown' ? 60 : -60), 0, DAY_MINUTES)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    emit('locate', keyboardMinute.value)
  }
}

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(measure)
    if (layout.value) observer.observe(layout.value)
  }
  window.addEventListener('resize', measure)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', measure)
})
</script>

<template>
  <div class="day-overview" data-testid="day-overview">
    <div ref="layout" class="overview-layout">
      <div class="time-gutter" aria-hidden="true">
        <template v-for="hour in hours" :key="hour">
          <span v-if="hour % hourStep === 0" class="hour-label overview-hour" :class="{ 'at-start': hour === 0, 'at-end': hour === 24 }" :style="{ top: percent(hour * 60) }">{{ String(hour).padStart(2, '0') }}<span>:00</span></span>
        </template>
      </div>
      <div
        class="overview-canvas"
        data-testid="overview-canvas"
        role="group"
        tabindex="0"
        aria-label="只读全日概览。点击时间段返回编辑；上下键选择整点，Enter 定位。"
        @click.self="locateBlank"
        @keydown.self="keydown"
      >
        <div v-for="hour in hours" :key="hour" class="overview-grid-line" :class="{ 'at-end': hour === 24 }" :style="{ top: percent(hour * 60) }" aria-hidden="true" />
        <button
          v-for="block in blocks"
          :key="block.id"
          class="overview-block"
          :data-overview-block-id="block.id"
          :style="[colorStyle(block.color, theme), { top: percent(block.startMinute), height: percent(block.endMinute - block.startMinute) }]"
          :title="`${block.title} · ${formatRange(block)}`"
          :aria-label="`${block.title}，${formatRange(block)}，返回此处编辑`"
          @click.stop="emit('locate', block.startMinute)"
        >
          <span v-if="height * (block.endMinute - block.startMinute) / DAY_MINUTES >= 22" class="overview-title">{{ block.title }}</span>
          <span v-if="height * (block.endMinute - block.startMinute) / DAY_MINUTES >= 42" class="overview-time">{{ formatTime(block.startMinute) }} — {{ formatTime(block.endMinute) }}</span>
        </button>
        <div class="overview-keyboard-line" :style="{ top: percent(keyboardMinute) }" aria-hidden="true"><span>{{ formatTime(keyboardMinute) }} · Enter 定位</span></div>
        <div v-if="isToday" class="now-line" data-testid="overview-now" :style="{ top: `min(${percent(nowMinute)}, calc(100% - 1px))` }" aria-hidden="true"><span class="now-dot" /></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.day-overview { flex: 1; min-height: 0; padding: 16px 22px 18px 0; overflow: auto; overscroll-behavior: contain; scrollbar-width: thin; scrollbar-color: var(--scroll-thumb) transparent; }
.overview-layout { height: 100%; min-height: 240px; display: flex; position: relative; margin-left: 28px; }
.overview-canvas { position: relative; flex: 1; min-width: 0; cursor: pointer; }
.overview-canvas:focus-visible { outline: 2px solid var(--focus); outline-offset: 3px; }
.overview-hour.at-start { transform: none; }
.overview-hour.at-end { transform: translateY(-100%); }
.overview-grid-line { position: absolute; left: 0; right: 0; height: 1px; background: var(--grid-major); pointer-events: none; }
.overview-grid-line.at-end { transform: translateY(-100%); }
.overview-block { position: absolute; left: 12px; right: 12px; min-height: 0; display: flex; align-items: center; gap: 16px; padding: 0 10px; overflow: hidden; border-left: 3px solid var(--block-edge); border-radius: 5px; background: var(--block-bg); color: var(--block-ink); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--block-edge) 40%, transparent); text-align: left; z-index: 2; }
.overview-block:hover { background: var(--block-hover); }
.overview-block:focus-visible { outline-offset: 1px; z-index: 3; }
.overview-title { min-width: 0; font-size: 12px; font-weight: 600; line-height: 18px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.overview-time { flex-shrink: 0; font-size: 10px; line-height: 18px; font-variant-numeric: tabular-nums; opacity: .85; }
.overview-keyboard-line { display: none; position: absolute; left: 0; right: 0; height: 2px; background: var(--focus); pointer-events: none; z-index: 4; }
.overview-keyboard-line span { position: absolute; right: 0; bottom: 4px; padding: 3px 6px; border-radius: 4px; background: var(--keyboard-bg); color: var(--keyboard-ink); font-size: 11px; white-space: nowrap; }
.overview-canvas:focus-visible > .overview-keyboard-line { display: block; }
@media (max-width: 760px) {
  .day-overview { padding-right: 12px; }
  .overview-layout { margin-left: 14px; }
  .overview-block { left: 8px; right: 8px; gap: 8px; }
}
@media (max-width: 520px) {
  .day-overview { padding-right: 7px; }
  .overview-layout { margin-left: 6px; }
  .overview-time { display: none; }
}
</style>
