// The five stationery colours used for new blocks and the colour picker.
export const PALETTE = [
  { id: 'sage', label: '鼠尾草', background: '#D7E6C4', edge: '#91AD70', ink: '#344B2A', hover: '#C9DDB1',
    dark: { background: '#364333', edge: '#B1CB8B', ink: '#E2EFCF', hover: '#46563D' } },
  { id: 'lavender', label: '薰衣草', background: '#DFD0F4', edge: '#A68ACB', ink: '#442C5C', hover: '#D3BEEB',
    dark: { background: '#46384F', edge: '#C6A5E4', ink: '#EFE1FA', hover: '#574461' } },
  { id: 'sky', label: '晴空', background: '#BFDFF0', edge: '#77B2D4', ink: '#1F4052', hover: '#ABD3EA',
    dark: { background: '#30434E', edge: '#91C5DF', ink: '#D8EDF8', hover: '#3C5360' } },
  { id: 'peach', label: '蜜桃', background: '#F5D3BB', edge: '#D69C73', ink: '#5A3625', hover: '#EFC2A2',
    dark: { background: '#503C2D', edge: '#E1AF80', ink: '#F7E5D0', hover: '#634A35' } },
  { id: 'rose', label: '玫瑰', background: '#F1CFD8', edge: '#CC94A8', ink: '#58303F', hover: '#E9BCCA',
    dark: { background: '#50353E', edge: '#DDA1B4', ink: '#F8E0E7', hover: '#62424D' } },
] as const

// Keep the original neutral ID and appearance valid; never migrate a user's choice.
const LEGACY_NEUTRAL = {
  id: 'neutral', label: '燕麦', background: '#EEECE4', edge: '#BAB5A1', ink: '#5C5947', hover: '#E2DFD2',
  dark: { background: '#423E35', edge: '#C1B59C', ink: '#EEE6D8', hover: '#544E41' },
} as const

export type PaletteColor = (typeof PALETTE)[number]['id']
export type BlockColor = PaletteColor | typeof LEGACY_NEUTRAL.id

export function isBlockColor(value: unknown): value is BlockColor {
  return value === LEGACY_NEUTRAL.id || PALETTE.some(color => color.id === value)
}

export function colorStyle(value?: BlockColor, theme: 'light' | 'dark' = 'light') {
  const color = value === LEGACY_NEUTRAL.id ? LEGACY_NEUTRAL : PALETTE.find(color => color.id === value) ?? PALETTE[0]
  const surface = theme === 'dark' ? color.dark : color
  return {
    '--block-bg': surface.background,
    '--block-edge': surface.edge,
    '--block-ink': surface.ink,
    '--block-hover': surface.hover,
  }
}

/** Saved array order is creation order, independent of the sorted daily view. */
export function nextBlockColor(blocks: ReadonlyArray<{ color?: BlockColor }>): PaletteColor {
  const previous = blocks.at(-1)?.color
  const index = PALETTE.findIndex(color => color.id === previous)
  return PALETTE[(index + 1) % PALETTE.length].id
}
