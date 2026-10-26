import { STORAGE_KEY, validateBlocks } from './storage'
import { localDate } from './time'
import type { TimeBlock } from './time'

export interface BackupPreview {
  blocks: TimeBlock[]
  dateCount: number
  blockCount: number
}

export function parseBackup(text: string): BackupPreview {
  let value: unknown
  try { value = JSON.parse(text.replace(/^\uFEFF/, '')) } catch { throw new Error('文件不是有效的 JSON，请重新选择完整的备份文件。') }
  let records: unknown
  if (Array.isArray(value)) records = value // Also accept the original stored array, strictly validated.
  else {
    if (!value || typeof value !== 'object') throw new Error('无法识别备份格式。')
    const backup = value as Record<string, unknown>
    if (backup.format !== 'your24h-backup' || backup.version !== 1
      || typeof backup.exportedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(backup.exportedAt)
      || !Number.isFinite(Date.parse(backup.exportedAt))
      || new Date(backup.exportedAt).toISOString().slice(0, 19) !== backup.exportedAt.slice(0, 19)) {
      throw new Error('备份格式、版本或导出时间无效；目前支持 Your 24h v1 备份。')
    }
    records = backup.blocks
  }
  const blocks = validateBlocks(records)
  return { blocks, blockCount: blocks.length, dateCount: new Set(blocks.map(block => block.date)).size }
}

export function exportBackup(storage: Pick<Storage, 'getItem'>, now = new Date()) {
  // Read every saved date directly; never silently export only the tolerant loader's subset.
  const raw = storage.getItem(STORAGE_KEY)
  let records: unknown = []
  try { if (raw !== null) records = JSON.parse(raw) } catch { throw new Error('本地已保存数据损坏，无法生成完整备份；原数据未更改。') }
  const blocks = validateBlocks(records)
  return {
    filename: `your24h-backup-${localDate(now)}.json`,
    text: JSON.stringify({ format: 'your24h-backup', version: 1, exportedAt: now.toISOString(), blocks }, null, 2),
  }
}
