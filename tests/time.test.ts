import { describe, expect, it } from 'vitest'
import {
  canPlace, creationRange, formatDuration, formatTime, isDateKey, isValidRange, localDate,
  movedRange, overlaps, resizedRange, shiftDate, snapMinute,
} from '../src/domain/time'
import type { TimeBlock, TimeRange } from '../src/domain/time'

const date = '2026-10-15'
const range = (startMinute: number, endMinute: number): TimeRange => ({ startMinute, endMinute })
const block = (startMinute: number, endMinute: number, id = 'one'): TimeBlock => ({ ...range(startMinute, endMinute), id, date, title: '安排' })

describe('时间与本地日期', () => {
  it('以半小时吸附，精确整点不多出一格', () => {
    expect(snapMinute(14 * 60)).toBe(840)
    expect(snapMinute(16 * 60 - 1)).toBe(960)
    expect(snapMinute(16 * 60 + 1)).toBe(960)
  })
  it('格式化午夜、半点、24:00和时长', () => {
    expect(formatTime(0)).toBe('00:00')
    expect(formatTime(870)).toBe('14:30')
    expect(formatTime(1440)).toBe('24:00')
    expect(formatDuration(range(840, 960))).toBe('2h')
    expect(formatDuration(range(0, 90))).toBe('1h 30m')
    expect(formatDuration(range(0, 30))).toBe('30m')
  })
  it('使用当地日期，支持跨月、跨年和闰日', () => {
    expect(localDate(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01')
    expect(localDate(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31')
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01')
    expect(shiftDate('2024-03-01', -1)).toBe('2024-02-29')
    expect(isDateKey('2026-02-30')).toBe(false)
    expect(isDateKey('2024-02-29')).toBe(true)
    expect(isDateKey('broken')).toBe(false)
  })
})

describe('半开区间与创建', () => {
  it('允许相邻，不允许真正相交，日期互不影响', () => {
    expect(overlaps(range(840, 900), range(900, 960))).toBe(false)
    expect(overlaps(range(840, 930), range(900, 960))).toBe(true)
    expect(canPlace(range(900, 960), [block(840, 900)], date)).toBe(true)
    expect(canPlace(range(840, 900), [block(840, 900)], '2026-10-16')).toBe(true)
    expect(canPlace(range(840, 900), [block(840, 900)], date, 'one')).toBe(true)
  })
  it.each([range(-30, 30), range(0, 0), range(10, 40), range(1410, 1470), range(60, 30), range(NaN, 90)])('拒绝非法范围 %j', value => {
    expect(isValidRange(value)).toBe(false)
  })
  it('单击按所在半小时格创建，24:00只创建最后一格', () => {
    expect(creationRange(869, 869, false, [])).toEqual(range(840, 870))
    expect(creationRange(1440, 1440, false, [])).toEqual(range(1410, 1440))
  })
  it('从上往下和从下往上拖动，整点精确相同', () => {
    expect(creationRange(840, 960, true, [])).toEqual(range(840, 960))
    expect(creationRange(960, 840, true, [])).toEqual(range(840, 960))
  })
  it('起点终点都按最近网格吸附，至少保留半小时', () => {
    expect(creationRange(859, 963, true, [])).toEqual(range(870, 960))
    expect(creationRange(841, 842, true, [])).toEqual(range(840, 870))
  })
  it('创建停在前后邻居，不能穿过占用块', () => {
    const neighbours = [block(600, 660, 'before'), block(840, 900, 'after')]
    expect(creationRange(720, 1000, true, neighbours)).toEqual(range(720, 840))
    expect(creationRange(720, 200, true, neighbours)).toEqual(range(660, 720))
    expect(creationRange(850, 1000, true, neighbours)).toBeNull()
  })
  it('限制在00:00–24:00，支持整个白天', () => {
    expect(creationRange(0, 2000, true, [])).toEqual(range(0, 1440))
    expect(creationRange(1440, -20, true, [])).toEqual(range(0, 1440))
  })
})

describe('移动与调整大小', () => {
  it('保留时长，抓取偏移按相对距离计算', () => {
    expect(movedRange(block(840, 960), 0)).toEqual(range(840, 960))
    expect(movedRange(block(840, 960), 300)).toEqual(range(1140, 1260))
    expect(movedRange(block(840, 960), 20)).toEqual(range(870, 990))
  })
  it('移动不越界，也不缩短时长', () => {
    expect(movedRange(block(840, 960), -1000)).toEqual(range(0, 120))
    expect(movedRange(block(840, 960), 1000)).toEqual(range(1320, 1440))
  })
  it('上下边缘遇到相邻块时停止，至少30分钟且不翻转', () => {
    const item = block(840, 960)
    const neighbours = [item, block(720, 780, 'before'), block(1020, 1080, 'after')]
    expect(resizedRange(item, 'start', -300, neighbours)).toEqual(range(780, 960))
    expect(resizedRange(item, 'end', 300, neighbours)).toEqual(range(840, 1020))
    expect(resizedRange(item, 'start', 300, neighbours)).toEqual(range(930, 960))
    expect(resizedRange(item, 'end', -300, neighbours)).toEqual(range(840, 870))
  })
  it('忽略其他日期的邻居，并限制当天边界', () => {
    const item = block(840, 960)
    const otherDay = { ...block(0, 1440, 'other'), date: '2026-10-16' }
    expect(resizedRange(item, 'start', -2000, [otherDay])).toEqual(range(0, 960))
    expect(resizedRange(item, 'end', 2000, [otherDay])).toEqual(range(840, 1440))
  })
})
