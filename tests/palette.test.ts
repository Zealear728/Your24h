import { describe, expect, it } from 'vitest'
import { colorStyle, isBlockColor, nextBlockColor, PALETTE } from '../src/domain/palette'
import themesSource from '../src/themes.css?raw'

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

  it.each([...PALETTE.map(color => color.id), 'neutral'] as const)('深色 %s：文字和次要时间在默认、悬停背景下清晰', id => {
    const style = colorStyle(id, 'dark')
    for (const background of [style['--block-bg'], style['--block-hover']]) {
      const bg = rgb(background)
      const ink = rgb(style['--block-ink']).map((value, index) => value * 0.85 + bg[index] * 0.15)
      expect((luminance(ink) + 0.05) / (luminance(bg) + 0.05)).toBeGreaterThanOrEqual(4.5)
      const edge = rgb(style['--block-edge'])
      expect((luminance(edge) + 0.05) / (luminance(bg) + 0.05)).toBeGreaterThanOrEqual(3)
    }
  })

  it('深色页面、工具栏、警告、时间线和交互反馈的文字对比度达到4.5:1', () => {
    const darkSource = themesSource.split(':root[data-theme="dark"]')[1]
    const tokens = Object.fromEntries([...darkSource.matchAll(/(--[\w-]+):\s*(#[\da-f]+);/gi)].map(match => [match[1], match[2]]))
    for (const [foreground, background] of [
      ['--ink', '--paper'], ['--ink', '--page-bg'], ['--muted', '--paper'], ['--muted', '--page-bg'],
      ['--today-ink', '--today-bg'], ['--accent-ink', '--accent-bg'], ['--accent-ink', '--accent-hover'],
      ['--section-ink', '--section-bg'], ['--warning-ink', '--warning-bg'], ['--keyboard-ink', '--keyboard-bg'],
      ['--invalid-ink', '--invalid-bg'], ['--label-ink', '--label-bg'], ['--label-ink', '--invalid-label-bg'],
      ['--footer-ink', '--footer-bg'], ['--now-ink', '--paper'], ['--toast-ink', '--toast-bg'],
      ['--danger', '--delete-hover'], ['--warning-ink', '--warning-bg'], ['--empty-caption', '--paper'],
    ]) {
      const values = [luminance(rgb(tokens[foreground])), luminance(rgb(tokens[background]))].sort((a, b) => a - b)
      expect((values[1] + 0.05) / (values[0] + 0.05), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
