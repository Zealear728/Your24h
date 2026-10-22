import { canPlace, isDateKey } from './time'
import type { TimeBlock } from './time'
import { isBlockColor } from './palette'

export const STORAGE_KEY = 'day-canvas.blocks.v1'
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>

export function loadBlocks(storage: StoragePort): { blocks: TimeBlock[]; warning: string } {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return { blocks: [], warning: '' }
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) throw new Error('Invalid data')
    const blocks: TimeBlock[] = []
    let skipped = false
    for (const item of data) {
      if (!item || typeof item !== 'object') { skipped = true; continue }
      const record = item as Record<string, unknown>
      if (typeof record.id !== 'string' || !record.id.trim() || !isDateKey(record.date)
        || typeof record.title !== 'string' || !record.title.trim()
        || typeof record.startMinute !== 'number' || typeof record.endMinute !== 'number'
        || blocks.some(block => block.id === record.id)) { skipped = true; continue }
      const block: TimeBlock = {
        id: record.id, date: record.date, title: record.title.trim(),
        startMinute: record.startMinute, endMinute: record.endMinute,
        color: isBlockColor(record.color) ? record.color : 'sage',
      }
      if (canPlace(block, blocks, block.date)) blocks.push(block)
      else skipped = true
    }
    return { blocks, warning: skipped ? '部分本地记录无效，已跳过；其余安排已恢复。' : '' }
  } catch {
    return { blocks: [], warning: '本地数据无法读取。可以继续安排；下次保存将写入新的记录。' }
  }
}

export function saveBlocks(storage: StoragePort, blocks: TimeBlock[]): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(blocks))
    return true
  } catch {
    return false
  }
}
