import { describe, expect, it } from 'vitest'
import { exportBackup, parseBackup } from '../src/domain/backup'
import { loadBlocks, STORAGE_KEY, validateBlocks } from '../src/domain/storage'
import type { TimeBlock } from '../src/domain/time'

const item: TimeBlock = { id: 'one', date: '2026-10-26', startMinute: 540, endMinute: 660, title: '写作业', color: 'sage' }
const envelope = (blocks: unknown) => JSON.stringify({ format: 'your24h-backup', version: 1, exportedAt: '2026-10-26T14:00:00.000Z', blocks })

describe('JSON备份的整份校验', () => {
  it('导出读取原存储的全部日期，文件可完整导入，采用本地日期文件名', () => {
    const blocks = [item, { ...item, id: 'tomorrow', date: '2026-10-27', color: 'neutral' as const }]
    const backup = exportBackup({ getItem: key => key === STORAGE_KEY ? JSON.stringify(blocks) : null }, new Date(2026, 9, 26, 23, 50))
    expect(backup.filename).toBe('your24h-backup-2026-10-26.json')
    const file = JSON.parse(backup.text)
    expect(file).toMatchObject({ format: 'your24h-backup', version: 1, blocks })
    expect(parseBackup(backup.text)).toEqual({ blocks, dateCount: 2, blockCount: 2 })
  })

  it('支持UTF-8 BOM和旧版合法数组，缺省颜色兼容原加载规则', () => {
    const old = { id: 'old', date: '2026-10-26', startMinute: 0, endMinute: 30, title: '旧数据' }
    expect(parseBackup('\uFEFF' + JSON.stringify([old])).blocks).toEqual([{ ...old, color: 'sage' }])
    expect(loadBlocks({ getItem: () => JSON.stringify([old]), setItem: () => {} }).blocks).toEqual([{ ...old, color: 'sage' }])
  })

  it('所有颜色ID保留，允许相邻时间块及不同日期的相同时间范围', () => {
    const colors = ['sage', 'lavender', 'sky', 'peach', 'rose', 'neutral'] as const
    const blocks = colors.map((color, index) => ({ ...item, id: String(index), startMinute: index * 30, endMinute: index * 30 + 30, color }))
    blocks.push({ ...blocks[0], id: 'another-day', date: '2026-10-27' })
    expect(parseBackup(envelope(blocks)).blocks).toEqual(blocks)
  })

  it.each([
    { id: '' }, { id: 3 }, { date: '2026-02-30' }, { date: '2026-1-2' },
    { startMinute: -30 }, { startMinute: 540.5 }, { startMinute: '540' }, { endMinute: 1500 },
    { endMinute: 540 }, { endMinute: 555 }, { title: '' }, { title: '  ' }, { title: 7 },
    { color: 'unknown' }, { color: null },
  ])('无效字段%j拒绝整份备份，不跳过错误记录', patch => {
    expect(() => parseBackup(envelope([item, { ...item, id: 'invalid', date: '2026-10-27', ...patch }]))).toThrow()
  })

  it('无效根结构、版本、导出时间、损坏JSON和重复ID均拒绝', () => {
    for (const text of ['{broken', 'null', '{}', '42', envelope(null), envelope([item, item]),
      JSON.stringify({ format: 'your24h-backup', version: 2, exportedAt: '2026-10-26T14:00:00Z', blocks: [] }),
      JSON.stringify({ format: 'your24h-backup', version: 1, exportedAt: '0', blocks: [] }),
      JSON.stringify({ format: 'your24h-backup', version: 1, exportedAt: '2026-02-30T14:00:00Z', blocks: [] })]) {
      expect(() => parseBackup(text)).toThrow()
    }
  })

  it('乱序重叠和相同起点均拒绝；校验不改变备份的创建顺序', () => {
    expect(() => parseBackup(envelope([item, { ...item, id: 'overlap', startMinute: 510, endMinute: 600 }]))).toThrow('重叠')
    expect(() => parseBackup(envelope([item, { ...item, id: 'same-start' }]))).toThrow('重叠')
    const earlier = { ...item, id: 'earlier', startMinute: 0, endMinute: 30 }
    expect(validateBlocks([item, earlier])).toEqual([item, earlier])
  })

  it('空存储可导出空备份；损坏或读权限异常时不能伪装成成功的部分备份', () => {
    expect(parseBackup(exportBackup({ getItem: () => null }).text)).toEqual({ blocks: [], dateCount: 0, blockCount: 0 })
    expect(() => exportBackup({ getItem: () => '{broken' })).toThrow()
    expect(() => exportBackup({ getItem: () => JSON.stringify([item, { ...item, id: 'bad', color: 'broken' }]) })).toThrow()
    expect(() => exportBackup({ getItem: () => { throw new Error('security') } })).toThrow()
  })
})
