import { vi } from 'vitest'

// jsdom has no pointer capture or layout; exercise the DOM event flow with explicit coordinates.
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number
  readonly isPrimary: boolean
  readonly pointerType: string
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init)
    this.pointerId = init.pointerId ?? 1
    this.isPrimary = init.isPrimary ?? true
    this.pointerType = init.pointerType ?? 'mouse'
  }
}
vi.stubGlobal('PointerEvent', TestPointerEvent)
const captures = new WeakMap<HTMLElement, Set<number>>()
HTMLElement.prototype.setPointerCapture = function (id: number) {
  const ids = captures.get(this) ?? new Set<number>()
  ids.add(id)
  captures.set(this, ids)
}
HTMLElement.prototype.hasPointerCapture = function (id: number) { return captures.get(this)?.has(id) ?? false }
HTMLElement.prototype.releasePointerCapture = function (id: number) { captures.get(this)?.delete(id) }
vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1))
vi.stubGlobal('cancelAnimationFrame', vi.fn())
