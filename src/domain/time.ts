import type { BlockColor } from './palette'

export const DAY_MINUTES = 1440
export const STEP = 30
export const HOUR_HEIGHT = 80
export const MINUTE_HEIGHT = HOUR_HEIGHT / 60
export const DRAG_THRESHOLD = 6

export interface TimeRange {
  startMinute: number
  endMinute: number
}

export interface TimeBlock extends TimeRange {
  id: string
  date: string
  title: string
  color?: BlockColor
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export function snapMinute(minute: number): number {
  return Math.round(minute / STEP) * STEP
}

export function formatTime(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

export function formatDuration(range: TimeRange): string {
  const minutes = range.endMinute - range.startMinute
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return [hours ? `${hours}h` : '', rest ? `${rest}m` : ''].filter(Boolean).join(' ')
}

export function formatRange(range: TimeRange): string {
  return `${formatTime(range.startMinute)} → ${formatTime(range.endMinute)} · ${formatDuration(range)}`
}

export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T12:00:00`)
  return !Number.isNaN(parsed.getTime()) && localDate(parsed) === value
}

export function shiftDate(date: string, days: number): string {
  const result = new Date(`${date}T12:00:00`)
  result.setDate(result.getDate() + days)
  return localDate(result)
}

export function overlaps(a: TimeRange, b: TimeRange): boolean {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute
}

export function isValidRange(range: TimeRange): boolean {
  return Number.isInteger(range.startMinute) && Number.isInteger(range.endMinute)
    && range.startMinute >= 0 && range.endMinute <= DAY_MINUTES
    && range.endMinute - range.startMinute >= STEP
    && range.startMinute % STEP === 0 && range.endMinute % STEP === 0
}

export function canPlace(range: TimeRange, blocks: TimeBlock[], date: string, excludeId?: string): boolean {
  return isValidRange(range) && !blocks.some(block =>
    block.date === date && block.id !== excludeId && overlaps(range, block))
}

/** The free interval surrounding a cell; gestures may never cross its neighbours. */
export function freeInterval(cell: TimeRange, blocks: TimeBlock[]): TimeRange | null {
  if (blocks.some(block => overlaps(cell, block))) return null
  return {
    startMinute: Math.max(0, ...blocks.filter(block => block.endMinute <= cell.startMinute).map(block => block.endMinute)),
    endMinute: Math.min(DAY_MINUTES, ...blocks.filter(block => block.startMinute >= cell.endMinute).map(block => block.startMinute)),
  }
}

export function creationRange(origin: number, current: number, dragged: boolean, blocks: TimeBlock[]): TimeRange | null {
  const cellStart = clamp(Math.floor(origin / STEP) * STEP, 0, DAY_MINUTES - STEP)
  const cell = { startMinute: cellStart, endMinute: cellStart + STEP }
  const free = freeInterval(cell, blocks)
  if (!free) return null
  if (!dragged) return cell
  const anchor = clamp(snapMinute(origin), free.startMinute, free.endMinute)
  const endpoint = clamp(snapMinute(current), free.startMinute, free.endMinute)
  if (anchor === endpoint) return cell
  return { startMinute: Math.min(anchor, endpoint), endMinute: Math.max(anchor, endpoint) }
}

export function movedRange(block: TimeRange, delta: number): TimeRange {
  const duration = block.endMinute - block.startMinute
  const startMinute = clamp(block.startMinute + snapMinute(delta), 0, DAY_MINUTES - duration)
  return { startMinute, endMinute: startMinute + duration }
}

export function resizedRange(block: TimeBlock, edge: 'start' | 'end', delta: number, blocks: TimeBlock[]): TimeRange {
  const others = blocks.filter(other => other.id !== block.id && other.date === block.date)
  const free = freeInterval(block, others)!
  return edge === 'start'
    ? { startMinute: clamp(block.startMinute + snapMinute(delta), free.startMinute, block.endMinute - STEP), endMinute: block.endMinute }
    : { startMinute: block.startMinute, endMinute: clamp(block.endMinute + snapMinute(delta), block.startMinute + STEP, free.endMinute) }
}

