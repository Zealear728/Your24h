import { describe, expect, it } from 'vitest'
import { colorStyle, isBlockColor, nextBlockColor, PALETTE } from '../src/domain/palette'

function rgb(hex: string) {
  return [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16))
}

function luminance(channels: number[]) {
  const [r, g, b] = channels.map(channel => {
    const value = channel / 255
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return r * 0.2126 + g * 0.7152 + b * 0.0722
}

describe('默认配色与旧颜色兼容', () => {
  it('按保存顺序轮换五色，最后一种之后回到第一种', () => {
    expect(nextBlockColor([])).toBe('sage')
    expect(nextBlockColor([{ color: 'sage' }])).toBe('lavender')
    expect(nextBlockColor([{ color: 'lavender' }])).toBe('sky')
    expect(nextBlockColor([{ color: 'sky' }])).toBe('peach')
    expect(nextBlockColor([{ color: 'peach' }])).toBe('rose')
    expect(nextBlockColor([{ color: 'rose' }])).toBe('sage')
  })

  it('旧燕麦仍是有效颜色，下一块从绿开始，不改变旧颜色', () => {
    expect(isBlockColor('neutral')).toBe(true)
    expect(isBlockColor('rose')).toBe(true)
    expect(isBlockColor('unrecognised')).toBe(false)
    expect(colorStyle('neutral')['--block-bg']).toBe('#EEECE4')
    const blocks = [{ color: 'neutral' as const }]
    expect(nextBlockColor(blocks)).toBe('sage')
    expect(blocks).toEqual([{ color: 'neutral' }])
  })

  it.each(PALETTE)('$label 的文字、85%透明度次要文字及悬停按钮对比度均达到4.5:1', color => {
    for (const background of [color.background, color.hover]) {
      const bg = rgb(background)
      // Secondary time text currently uses 85% opacity on the block's background.
      const ink = rgb(color.ink).map((value, index) => value * 0.85 + bg[index] * 0.15)
      const contrast = (luminance(bg) + 0.05) / (luminance(ink) + 0.05)
      expect(contrast).toBeGreaterThanOrEqual(4.5)
    }
  })
})
