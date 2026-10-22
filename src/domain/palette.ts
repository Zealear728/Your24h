// The five stationery colours used for new blocks and the colour picker.
export const PALETTE = [
  { id: 'sage', label: '鼠尾草', background: '#D7E6C4', edge: '#91AD70', ink: '#344B2A', hover: '#C9DDB1' },
  { id: 'lavender', label: '薰衣草', background: '#DFD0F4', edge: '#A68ACB', ink: '#442C5C', hover: '#D3BEEB' },
  { id: 'sky', label: '晴空', background: '#BFDFF0', edge: '#77B2D4', ink: '#1F4052', hover: '#ABD3EA' },
  { id: 'peach', label: '蜜桃', background: '#F5D3BB', edge: '#D69C73', ink: '#5A3625', hover: '#EFC2A2' },
  { id: 'rose', label: '玫瑰', background: '#F1CFD8', edge: '#CC94A8', ink: '#58303F', hover: '#E9BCCA' },
] as const

// Keep the original neutral ID and appearance valid; never migrate a user's choice.
const LEGACY_NEUTRAL = {
  id: 'neutral', label: '燕麦', background: '#EEECE4', edge: '#BAB5A1', ink: '#5C5947', hover: '#E2DFD2',
} as const

export type PaletteColor = (typeof PALETTE)[number]['id']
export type BlockColor = PaletteColor | typeof LEGACY_NEUTRAL.id

export function isBlockColor(value: unknown): value is BlockColor {
  return value === LEGACY_NEUTRAL.id || PALETTE.some(color => color.id === value)
}

export function colorStyle(value?: BlockColor) {
  const color = value === LEGACY_NEUTRAL.id ? LEGACY_NEUTRAL : PALETTE.find(color => color.id === value) ?? PALETTE[0]
  return {
    '--block-bg': color.background,
    '--block-edge': color.edge,
    '--block-ink': color.ink,
    '--block-hover': color.hover,
  }
}

/** Saved array order is creation order, independent of the sorted daily view. */
export function nextBlockColor(blocks: ReadonlyArray<{ color?: BlockColor }>): PaletteColor {
  const previous = blocks.at(-1)?.color
  const index = PALETTE.findIndex(color => color.id === previous)
  return PALETTE[(index + 1) % PALETTE.length].id
}
