<script setup lang="ts">
import AppIcon from './components/AppIcon.vue'
import TitleEditor from './components/TitleEditor.vue'
import { useCanvas } from './composables/useCanvas'
import { DAY_MINUTES, formatDuration, formatRange, formatTime, HOUR_HEIGHT, MINUTE_HEIGHT } from './domain/time'
import { colorStyle, PALETTE } from './domain/palette'
import type { TimeRange } from './domain/time'

const {
  canvas, scroller, editor, gesture, paletteId, notice, saved, feedback, selectedDate,
  isToday, nowMinute, dayBlocks, visibleBlocks, dateLabel, weekday, yearLabel, keyboardMinute,
  finishEdit, editBlock, removeBlock, setColor, startBlank, startGesture, pointerCancel, jumpToNow,
  changeDate, shiftDate, localDate, canvasKeydown, blockKeydown, retrySave,
} = useCanvas()

const hours = Array.from({ length: 25 }, (_, hour) => hour)
function rangeStyle(range: TimeRange) {
  return {
    top: `${range.startMinute * MINUTE_HEIGHT}px`,
    height: `${(range.endMinute - range.startMinute) * MINUTE_HEIGHT - 3}px`,
  }
}
</script>

<template>
  <div class="app-shell" @pointerdown="paletteId = null">
    <header class="masthead">
      <a class="brand" href="#" aria-label="每天时间画布，回到今天" @click.prevent="changeDate(localDate())">
        <span class="brand-mark"><AppIcon name="pen" /></span>
        <span>每天<span class="brand-divider">/</span><span class="brand-subtitle">时间画布</span></span>
      </a>
      <span class="storage-state" :class="{ 'is-unsaved': !saved }">
        <AppIcon :name="saved ? 'check' : 'clock'" />{{ saved ? '保存在此浏览器' : '尚未保存' }}
      </span>
    </header>

    <main class="workspace">
      <section class="intro" aria-labelledby="page-title">
        <div>
          <p class="eyebrow">A LITTLE ROOM FOR YOUR DAY</p>
          <h1 id="page-title">把时间，画成喜欢的样子<span class="title-dot">。</span></h1>
          <p class="intro-copy">留一点空白，做一点喜欢的事。</p>
        </div>
        <div class="paper-note" aria-hidden="true"><span>one day</span><span>at a time.</span><svg viewBox="0 0 90 18"><path d="M2 9q28-10 48-2t36 0" /></svg></div>
      </section>

      <section class="day-sheet" aria-label="单日时间画布">
        <div class="day-toolbar">
          <div class="date-navigation">
            <div class="nav-buttons">
              <button class="icon-button" aria-label="前一天" title="前一天" @click="changeDate(shiftDate(selectedDate, -1))"><AppIcon name="left" /></button>
              <button class="icon-button" aria-label="后一天" title="后一天" @click="changeDate(shiftDate(selectedDate, 1))"><AppIcon name="right" /></button>
            </div>
            <div class="date-heading">
              <div class="date-main"><h2>{{ dateLabel }}</h2><span v-if="isToday" class="today-badge">今天</span></div>
              <span class="date-detail">{{ yearLabel }}<span>·</span>{{ weekday }}</span>
            </div>
            <label class="date-picker" title="选择日期">
              <span class="sr-only">选择日期</span>
              <input aria-label="选择日期" type="date" :value="selectedDate" @change="changeDate(($event.target as HTMLInputElement).value)" />
            </label>
          </div>
          <div class="toolbar-actions">
            <button class="text-button today-button" @click="changeDate(localDate())">今天</button>
            <button class="now-button" :disabled="!isToday" @click="jumpToNow"><AppIcon name="clock" />跳到现在</button>
          </div>
        </div>

        <div class="canvas-meta"><span>24 小时，一张画布</span><span class="grid-label"><i />30 分钟吸附</span></div>
        <div v-if="notice" class="notice" role="status">
          <span>{{ notice }}</span><button v-if="!saved" @click="retrySave">重试保存</button><button v-else aria-label="关闭提示" @click="notice = ''">×</button>
        </div>

        <div ref="scroller" class="timeline-scroll" data-testid="timeline-scroll">
          <div class="timeline-layout" :style="{ height: `${DAY_MINUTES * MINUTE_HEIGHT}px` }">
            <div class="time-gutter" aria-hidden="true">
              <span v-for="hour in hours" :key="hour" class="hour-label" :style="{ top: `${hour * HOUR_HEIGHT}px` }">{{ String(hour).padStart(2, '0') }}<span>:00</span></span>
            </div>
            <div
              ref="canvas"
              class="time-canvas"
              :class="{ 'is-gesturing': gesture, 'is-creating': gesture?.kind === 'create' }"
              tabindex="0"
              aria-label="时间画布，用上下方向键选择时间，Enter 创建"
              aria-describedby="canvas-help keyboard-help"
              data-testid="canvas"
              @pointerdown="startBlank"
              @lostpointercapture="pointerCancel"
              @keydown="canvasKeydown"
            >
              <div class="keyboard-cell" :style="rangeStyle({ startMinute: keyboardMinute, endMinute: keyboardMinute + 30 })"><span>{{ formatTime(keyboardMinute) }} · Enter 创建</span></div>
              <div v-if="!dayBlocks.length && !editor && !gesture" class="empty-hint" :style="{ top: `${10 * HOUR_HEIGHT + 20}px` }" aria-hidden="true">
                <span class="empty-pen"><AppIcon name="pen" /></span><span>从一段想做的事开始</span><small>在空白处拖一笔，给时间一个名字</small>
              </div>

              <article
                v-for="block in visibleBlocks"
                :key="block.id"
                class="time-block"
                :class="[
                  `color-${block.color || 'sage'}`,
                  { 'is-editing': editor?.block.id === block.id,
                    'is-draft': editor?.isNew && editor.block.id === block.id,
                    'is-dragging': gesture?.active && gesture.block?.id === block.id,
                    'is-invalid': gesture?.active && gesture.block?.id === block.id && gesture.invalid,
                    'is-compact': block.endMinute - block.startMinute === 30,
                    'palette-open': paletteId === block.id },
                ]"
                :style="[rangeStyle(block), colorStyle(block.color)]"
                :aria-label="`${block.title || '新安排'}，${formatRange(block)}`"
                :data-block-id="block.id"
                @pointerdown.stop="startGesture($event, 'move', block)"
              >
                <div class="resize-handle resize-top" aria-hidden="true" title="拖动调整开始时间" data-testid="resize-start" @pointerdown.stop="startGesture($event, 'start', block)"><span /></div>
                <div class="block-content">
                  <div class="block-heading">
                    <TitleEditor v-if="editor?.block.id === block.id" v-model="editor.text" @finish="finishEdit" />
                    <button v-else class="block-title" :title="`${block.title} · ${formatRange(block)}`" @pointerdown.stop @click="editBlock(block)">{{ block.title }}</button>
                    <span class="block-duration">{{ formatDuration(block) }}</span>
                  </div>
                  <div class="block-time">{{ formatTime(block.startMinute) }}<span>—</span>{{ formatTime(block.endMinute) }}</div>
                </div>

                <div v-if="editor?.block.id !== block.id" class="block-actions" @pointerdown.stop>
                  <button class="block-grip" aria-label="移动时间块：上下键移动，Shift 加上下键调整结束，Alt 加 Shift 加上下键调整开始" title="拖动移动 · 也可用上下键" @pointerdown.stop="startGesture($event, 'move', block)" @keydown="blockKeydown($event, block)"><AppIcon name="grip" /></button>
                  <button class="block-action" :aria-label="`更换 ${block.title} 的颜色`" title="更换颜色" :aria-expanded="paletteId === block.id" @click="paletteId = paletteId === block.id ? null : block.id"><AppIcon name="palette" /></button>
                  <button class="block-action delete-button" :aria-label="`删除 ${block.title}`" title="删除时间块" @click="removeBlock(block.id)"><AppIcon name="trash" /></button>
                </div>

                <div v-if="paletteId === block.id" class="color-palette" role="group" aria-label="时间块颜色" @pointerdown.stop>
                  <button v-for="color in PALETTE" :key="color.id" :class="['color-swatch', `color-${color.id}`]" :style="colorStyle(color.id)" :aria-label="color.label" :aria-pressed="(block.color || 'sage') === color.id" :title="color.label" @click="setColor(block.id, color.id)"><AppIcon v-if="(block.color || 'sage') === color.id" name="check" /></button>
                </div>
                <div class="resize-handle resize-bottom" aria-hidden="true" title="拖动调整结束时间" data-testid="resize-end" @pointerdown.stop="startGesture($event, 'end', block)"><span /></div>
                <div v-if="gesture?.active && gesture.block?.id === block.id" class="gesture-label" :class="{ 'invalid-label': gesture.invalid }">{{ gesture.invalid ? '此处已有安排 · 松手回原位' : formatRange(block) }}</div>
              </article>

              <div v-if="gesture?.kind === 'create'" class="creation-preview" :style="[rangeStyle(gesture.preview), colorStyle()]">
                <span class="selection-plus">+</span><span class="selection-label">{{ formatRange(gesture.preview) }}</span>
              </div>
              <div v-if="isToday" class="now-line" :style="{ top: `${nowMinute * MINUTE_HEIGHT}px` }" aria-hidden="true"><span class="now-time">{{ formatTime(Math.floor(nowMinute)) }}</span><span class="now-dot" /></div>
            </div>
          </div>
        </div>

        <footer class="sheet-footer">
          <span id="canvas-help"><AppIcon name="pen" /><span>单击或拖动创建<span class="footer-divider">·</span><kbd>Enter</kbd> 保存<span class="footer-divider">·</span><kbd>Esc</kbd> 取消</span></span>
          <span class="sheet-signature">YOUR DAY, YOUR PACE.</span>
        </footer>
      </section>
      <p class="bottom-note">安排保存在当前浏览器里，每一天都有自己的空白。</p>
      <p id="keyboard-help" class="sr-only">画布上下键选择时间，Enter 新建。聚焦时间块的移动按钮后，上下键移动，Shift 加上下键调整结束，Alt 加 Shift 加上下键调整开始，Delete 删除。</p>
    </main>
    <div class="sr-only" role="status" aria-live="polite">{{ feedback }}</div>
    <div v-if="feedback" class="toast" aria-hidden="true">{{ feedback }}</div>
  </div>
</template>
