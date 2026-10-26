import { canPlace, isDateKey, isValidRange, overlaps } from './time'
import type { TimeBlock } from './time'
import { isBlockColor } from './palette'

export const STORAGE_KEY = 'day-canvas.blocks.v1'
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>

function readBlock(item: unknown, strictColor = false): TimeBlock | null {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null
  const record = item as Record<string, unknown>
  if (typeof record.id !== 'string' || !record.id.trim() || !isDateKey(record.date)
    || typeof record.title !== 'string' || !record.title.trim()
    || typeof record.startMinute !== 'number' || typeof record.endMinute !== 'number'
    || (strictColor && record.color !== undefined && !isBlockColor(record.color))) return null
  const block: TimeBlock = {
    id: record.id, date: record.date, title: record.title.trim(),
    startMinute: record.startMinute, endMinute: record.endMinute,
    color: isBlockColor(record.color) ? record.color : 'sage',
  }
  return isValidRange(block) ? block : null
}

/** Strict all-or-nothing validation for backups; legacy local loading remains tolerant. */
export function validateBlocks(data: unknown): TimeBlock[] {
  if (!Array.isArray(data)) throw new Error('时间块数据必须是数组。')
  const ids = new Set<string>()
  const dates = new Map<string, TimeBlock[]>()
  const blocks = data.map((item, index) => {
    const block = readBlock(item, true)
    if (!block) throw new Error(`第 ${index + 1} 个时间块无效，请检查 ID、日期、半小时时间范围、标题及颜色。`)
    if (ids.has(block.id)) throw new Error(`第 ${index + 1} 个时间块的 ID 重复。`)
    ids.add(block.id)
    const day = dates.get(block.date) ?? []
    day.push(block)
    dates.set(block.date, day)
    return block
  })
  for (const [date, day] of dates) {
    day.sort((a, b) => a.startMinute - b.startMinute)
    for (let index = 1; index < day.length; index++) {
      if (overlaps(day[index - 1], day[index])) throw new Error(`${date} 存在重叠的时间块，未导入任何数据。`)
    }
  }
  return blocks
}

export function loadBlocks(storage: StoragePort): { blocks: TimeBlock[]; warning: string } {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return { blocks: [], warning: '' }
    const data: unknown = JSON.parse(raw)
    if (!Array.isArray(data)) throw new Error('Invalid data')
    const blocks: TimeBlock[] = []
    let skipped = false
    for (const item of data) {
      const block = readBlock(item)
      if (!block || blocks.some(other => other.id === block.id)) { skipped = true; continue }
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
