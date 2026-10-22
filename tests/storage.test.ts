import { describe, expect, it } from 'vitest'
import { loadBlocks, saveBlocks, STORAGE_KEY } from '../src/domain/storage'
import type { TimeBlock } from '../src/domain/time'

const item: TimeBlock = { id: 'one', date: '2026-10-15', startMinute: 540, endMinute: 660, title: '写作业', color: 'sage' }
const source = (value: unknown) => ({ getItem: () => JSON.stringify(value), setItem: () => {} })

describe('浏览器存储', () => {
  it('空存储返回空画布', () => {
    expect(loadBlocks({ getItem: () => null, setItem: () => {} })).toEqual({ blocks: [], warning: '' })
  })
  it('保存再读取全部日期', () => {
    let raw = ''
    const storage = { getItem: (key: string) => key === STORAGE_KEY ? raw : null, setItem: (_key: string, value: string) => { raw = value } }
    const blocks = [item, { ...item, id: 'two', date: '2026-10-16', color: 'peach' as const }]
    expect(saveBlocks(storage, blocks)).toBe(true)
    expect(loadBlocks(storage)).toEqual({ blocks, warning: '' })
  })
  it.each(['{broken', '{"unexpected":true}'])('损坏JSON或结构不导致崩溃：%s', raw => {
    const result = loadBlocks({ getItem: () => raw, setItem: () => {} })
    expect(result.blocks).toEqual([])
    expect(result.warning).not.toBe('')
  })
  it('保留有效记录，跳过重复、重叠、空标题、非法日期和越界数据', () => {
    const data = [
      item, null, 12, {}, { ...item }, { ...item, id: 'overlap', startMinute: 600 },
      { ...item, id: 'blank', title: '  ' }, { ...item, id: 'date', date: '2026-02-31' },
      { ...item, id: 'boundary', endMinute: 1500 }, { ...item, id: 'step', startMinute: 541 },
      { ...item, id: 'valid', startMinute: 660, endMinute: 690, color: 'unknown' },
    ]
    const result = loadBlocks(source(data))
    expect(result.blocks).toEqual([item, { ...item, id: 'valid', startMinute: 660, endMinute: 690, color: 'sage' }])
    expect(result.warning).not.toBe('')
  })
  it('读取和写入被禁止或空间不足时返回可处理结果', () => {
    const storage = { getItem: (): string => { throw new Error('Access denied') }, setItem: () => { throw new Error('Quota exceeded') } }
    expect(loadBlocks(storage).warning).not.toBe('')
    expect(saveBlocks(storage, [item])).toBe(false)
  })

  it('所有旧有效颜色和新增玫瑰色读取、再保存后保持原值', () => {
    const colors = ['sage', 'lavender', 'peach', 'sky', 'neutral', 'rose'] as const
    const blocks = colors.map((color, index) => ({ ...item, id: String(index), startMinute: index * 60, endMinute: index * 60 + 30, color }))
    let raw = JSON.stringify(blocks)
    const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value } }
    const restored = loadBlocks(storage)
    expect(restored).toEqual({ blocks, warning: '' })
    expect(raw).toBe(JSON.stringify(blocks))
    saveBlocks(storage, restored.blocks)
    expect(JSON.parse(raw)).toEqual(blocks)
  })
})
