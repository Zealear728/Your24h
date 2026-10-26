<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { exportBackup, parseBackup } from '../domain/backup'
import type { BackupPreview } from '../domain/backup'

const props = defineProps<{ blockCount: number; hasUncommittedEdit: boolean; restore: (blocks: unknown) => boolean }>()
const emit = defineEmits<{ 'open-change': [open: boolean] }>()
const root = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const open = ref(false)
const pending = ref<BackupPreview | null>(null)
const filename = ref('')
const confirmed = ref(false)
const reading = ref(false)
const message = ref('')
const error = ref('')
let request = 0
const downloads = new Map<string, ReturnType<typeof setTimeout>>()
watch(open, value => emit('open-change', value), { flush: 'sync' })

function cancelImport() {
  ++request
  pending.value = null
  confirmed.value = false
  reading.value = false
  filename.value = ''
  error.value = ''
  if (fileInput.value) fileInput.value.value = ''
}

function close() { cancelImport(); open.value = false }
function toggle() {
  if (open.value) close()
  else { message.value = ''; error.value = ''; open.value = true }
}

function download() {
  error.value = ''
  try {
    const backup = exportBackup(window.localStorage)
    const url = URL.createObjectURL(new Blob([backup.text], { type: 'application/json;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = backup.filename
    downloads.set(url, setTimeout(() => { URL.revokeObjectURL(url); downloads.delete(url) }, 1000))
    document.body.append(anchor)
    try { anchor.click() } finally { anchor.remove() }
    message.value = '已发起备份下载，请确认文件已保存在下载文件夹。'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '无法导出备份，请检查浏览器的本地存储权限。'
  }
}

function chooseFile() {
  cancelImport()
  message.value = ''
  fileInput.value?.click()
}

async function selected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  const current = ++request
  pending.value = null
  confirmed.value = false
  error.value = ''
  reading.value = true
  filename.value = file.name
  try {
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('无法读取备份文件。'))
      reader.onerror = () => reject(new Error('文件读取失败，原有数据未更改。'))
      reader.onabort = () => reject(new Error('文件读取已取消。'))
      reader.readAsText(file, 'UTF-8')
    })
    if (current === request) pending.value = parseBackup(text)
  } catch (cause) {
    if (current === request) error.value = cause instanceof Error ? cause.message : '无法读取备份文件。'
  } finally {
    if (current === request) reading.value = false
  }
}

function restore() {
  if (!pending.value || !confirmed.value || reading.value) return
  error.value = ''
  try {
    const count = pending.value.blockCount
    if (!props.restore(pending.value.blocks)) throw new Error('浏览器未能保存备份，原有日程和未提交输入均未更改。请检查存储权限或空间后重试。')
    cancelImport()
    message.value = `已恢复 ${count} 个时间块，画布已更新。`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '导入失败，原有数据未更改。'
  }
}

function outside(event: PointerEvent) {
  if (open.value && event.target instanceof Node && !root.value?.contains(event.target)) close()
}
onMounted(() => document.addEventListener('pointerdown', outside))
onBeforeUnmount(() => {
  ++request
  document.removeEventListener('pointerdown', outside)
  for (const [url, timer] of downloads) { clearTimeout(timer); URL.revokeObjectURL(url) }
})
</script>

<template>
  <div ref="root" class="data-backup" data-backup @pointerdown.stop @keydown.esc.prevent.stop="close">
    <button class="text-button backup-toggle" :aria-expanded="open" aria-controls="backup-panel" @pointerdown.prevent @click="toggle"><AppIcon name="backup" />数据备份</button>
    <section v-if="open" id="backup-panel" class="backup-panel" aria-label="数据备份">
      <div class="backup-heading"><strong>给时间留一份备份</strong><button class="backup-close" aria-label="关闭数据备份" @click="close">×</button></div>
      <p class="backup-hint">仅在你的浏览器中处理。导出所有日期的已保存日程；未提交标题不包含在内。</p>
      <div class="backup-actions"><button class="text-button" @click="download">导出备份</button><button class="text-button" :disabled="reading" @click="chooseFile">导入备份</button></div>
      <input ref="fileInput" class="sr-only" type="file" accept=".json,application/json" aria-label="选择 JSON 备份文件" tabindex="-1" @change="selected" />
      <p v-if="reading" role="status" class="backup-hint">正在读取并校验文件…</p>
      <div v-if="pending" class="backup-preview">
        <p class="backup-filename">{{ filename }}</p>
        <p class="backup-count">包含 <strong>{{ pending.dateCount }}</strong> 个日期、<strong>{{ pending.blockCount }}</strong> 个时间块</p>
        <p class="backup-warning">当前画布有 {{ blockCount }} 个时间块。导入会替换当前浏览器的全部日程，不会合并。</p>
        <p v-if="pending.blockCount === 0" class="backup-warning">这是空备份，确认后将清空现有日程。</p>
        <p v-if="hasUncommittedEdit" class="backup-warning">当前未提交的标题也会取消；需要保留时，请先取消导入并保存标题。</p>
        <button class="backup-export-first" @click="download">先导出当前已保存数据</button>
        <label class="backup-confirm"><input v-model="confirmed" type="checkbox" /><span>我确认用这份备份替换全部本地日程</span></label>
        <div class="backup-actions"><button class="text-button backup-restore" :disabled="!confirmed" @click="restore">确认替换并恢复</button><button class="text-button" @click="cancelImport">取消导入</button></div>
      </div>
      <p v-if="error" class="backup-error" role="alert">{{ error }}</p>
      <p v-if="message" class="backup-message" role="status">{{ message }}</p>
    </section>
  </div>
</template>

<style scoped>
.data-backup { position: relative; }
.backup-toggle { min-height: 36px; display: inline-flex; align-items: center; gap: 6px; }
.backup-toggle svg { width: 16px; height: 16px; }
.backup-panel { position: absolute; top: calc(100% + 9px); right: 0; width: min(360px, calc(100vw - 44px)); max-height: min(70dvh, 560px); overflow: auto; padding: 16px; border: 1px solid var(--palette-border); border-radius: 12px; background: var(--paper); box-shadow: var(--palette-shadow); color: var(--ink); z-index: 30; cursor: default; }
.backup-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 14px; }
.backup-close { width: 28px; height: 28px; border-radius: 6px; font-size: 20px; }
.backup-close:hover { background: var(--button-hover); }
.backup-hint { color: var(--muted); font-size: 12px; line-height: 1.7; }
.backup-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.backup-preview { margin-top: 16px; padding-top: 4px; border-top: 1px solid var(--line); }
.backup-filename { overflow-wrap: anywhere; color: var(--muted); font-size: 11px; }
.backup-count { font-size: 13px; }
.backup-warning { font-size: 12px; line-height: 1.7; padding: 8px; border-radius: 6px; background: var(--warning-bg); color: var(--warning-ink); }
.backup-export-first { padding: 4px 0; color: var(--accent); font-size: 12px; text-decoration: underline; text-underline-offset: 3px; }
.backup-confirm { display: flex; align-items: flex-start; gap: 8px; margin: 14px 0; font-size: 12px; line-height: 1.7; cursor: pointer; }
.backup-confirm input { flex-shrink: 0; margin: 3px 0 0; accent-color: var(--focus); }
.backup-restore:not(:disabled) { background: var(--accent-bg); border-color: var(--accent-border); color: var(--accent-ink); }
.backup-error, .backup-message { font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; }
.backup-error { color: var(--danger); }
.backup-message { color: var(--saved-ink); }
@media (max-width: 520px) { .backup-panel { position: fixed; top: 76px; right: 16px; max-height: calc(100dvh - 100px); } }
</style>
