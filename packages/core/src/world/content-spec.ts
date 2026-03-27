import type { AtlasTileId } from './atlas.ts'

export type AuthoredBlockOcclusionMode = 'none' | 'full' | 'self'
export type AuthoredBlockRenderPass = 'opaque' | 'cutout' | 'translucent'

export interface AuthoredBlockTiles {
  top: AtlasTileId
  bottom: AtlasTileId
  side: AtlasTileId
}

export interface AuthoredBlockSpec {
  key: string
  name: string
  collidable: boolean
  breakable: boolean
  occlusion: AuthoredBlockOcclusionMode
  renderPass: AuthoredBlockRenderPass | null
  dropItemKey: string | null
  emittedLightLevel: number
  durability: number
  color: readonly [number, number, number]
  tiles?: AuthoredBlockTiles
}

export interface AuthoredItemSpec {
  key: string
  name: string
  color: readonly [number, number, number]
  maxStackSize: number
  placesBlockKey: string | null
  renderBlockKey: string | null
}

export interface StarterInventoryStackSpec {
  slot: number
  itemKey: string
  count: number
}

export const AUTHORED_BLOCK_SPECS = [
  {
    key: 'air',
    name: 'air',
    collidable: false,
    breakable: false,
    occlusion: 'none',
    renderPass: null,
    dropItemKey: null,
    emittedLightLevel: 0,
    durability: 0,
    color: [0, 0, 0],
  },
  {
    key: 'grass',
    name: 'grass',
    collidable: true,
    breakable: true,
    occlusion: 'full',
    renderPass: 'opaque',
    dropItemKey: 'grass',
    emittedLightLevel: 0,
    durability: 600,
    color: [0.42, 0.71, 0.31],
    tiles: {
      top: 'grass-top',
      bottom: 'dirt',
      side: 'grass-side',
    },
  },
  {
    key: 'dirt',
    name: 'dirt',
    collidable: true,
    breakable: true,
    occlusion: 'full',
    renderPass: 'opaque',
    dropItemKey: 'dirt',
    emittedLightLevel: 0,
    durability: 600,
    color: [0.48, 0.34, 0.2],
    tiles: {
      top: 'dirt',
      bottom: 'dirt',
      side: 'dirt',
    },
  },
  {
    key: 'stone',
    name: 'stone',
    collidable: true,
    breakable: true,
    occlusion: 'full',
    renderPass: 'opaque',
    dropItemKey: 'stone',
    emittedLightLevel: 0,
    durability: 1500,
    color: [0.5, 0.5, 0.56],
    tiles: {
      top: 'stone',
      bottom: 'stone',
      side: 'stone',
    },
  },
  {
    key: 'log',
    name: 'log',
    collidable: true,
    breakable: true,
    occlusion: 'full',
    renderPass: 'opaque',
    dropItemKey: 'log',
    emittedLightLevel: 0,
    durability: 900,
    color: [0.48, 0.37, 0.24],
    tiles: {
      top: 'log-top',
      bottom: 'log-top',
      side: 'log-side',
    },
  },
  {
    key: 'leaves',
    name: 'leaves',
    collidable: true,
    breakable: true,
    occlusion: 'self',
    renderPass: 'cutout',
    dropItemKey: 'leaves',
    emittedLightLevel: 0,
    durability: 300,
    color: [0.32, 0.58, 0.22],
    tiles: {
      top: 'leaves',
      bottom: 'leaves',
      side: 'leaves',
    },
  },
  {
    key: 'sand',
    name: 'sand',
    collidable: true,
    breakable: true,
    occlusion: 'full',
    renderPass: 'opaque',
    dropItemKey: 'sand',
    emittedLightLevel: 0,
    durability: 600,
    color: [0.84, 0.78, 0.52],
    tiles: {
      top: 'sand',
      bottom: 'sand',
      side: 'sand',
    },
  },
  {
    key: 'planks',
    name: 'planks',
    collidable: true,
    breakable: true,
    occlusion: 'full',
    renderPass: 'opaque',
    dropItemKey: 'planks',
    emittedLightLevel: 0,
    durability: 900,
    color: [0.72, 0.55, 0.31],
    tiles: {
      top: 'planks',
      bottom: 'planks',
      side: 'planks',
    },
  },
  {
    key: 'cobblestone',
    name: 'cobblestone',
    collidable: true,
    breakable: true,
    occlusion: 'full',
    renderPass: 'opaque',
    dropItemKey: 'cobblestone',
    emittedLightLevel: 0,
    durability: 1500,
    color: [0.58, 0.58, 0.61],
    tiles: {
      top: 'cobblestone',
      bottom: 'cobblestone',
      side: 'cobblestone',
    },
  },
  {
    key: 'brick',
    name: 'brick',
    collidable: true,
    breakable: true,
    occlusion: 'full',
    renderPass: 'opaque',
    dropItemKey: 'brick',
    emittedLightLevel: 0,
    durability: 1500,
    color: [0.69, 0.27, 0.22],
    tiles: {
      top: 'brick',
      bottom: 'brick',
      side: 'brick',
    },
  },
  {
    key: 'bedrock',
    name: 'bedrock',
    collidable: true,
    breakable: false,
    occlusion: 'full',
    renderPass: 'opaque',
    dropItemKey: null,
    emittedLightLevel: 0,
    durability: 0,
    color: [0.24, 0.24, 0.27],
    tiles: {
      top: 'bedrock',
      bottom: 'bedrock',
      side: 'bedrock',
    },
  },
  {
    key: 'glowstone',
    name: 'glowstone',
    collidable: true,
    breakable: true,
    occlusion: 'full',
    renderPass: 'opaque',
    dropItemKey: 'glowstone',
    emittedLightLevel: 15,
    durability: 600,
    color: [0.94, 0.79, 0.37],
    tiles: {
      top: 'glowstone',
      bottom: 'glowstone',
      side: 'glowstone',
    },
  },
  {
    key: 'water',
    name: 'water',
    collidable: false,
    breakable: false,
    occlusion: 'self',
    renderPass: 'translucent',
    dropItemKey: null,
    emittedLightLevel: 0,
    durability: 0,
    color: [0.25, 0.48, 0.82],
    tiles: {
      top: 'water',
      bottom: 'water',
      side: 'water',
    },
  },
  {
    key: 'coalOre',
    name: 'coal ore',
    collidable: true,
    breakable: true,
    occlusion: 'full',
    renderPass: 'opaque',
    dropItemKey: 'coalOre',
    emittedLightLevel: 0,
    durability: 2000,
    color: [0.31, 0.31, 0.33],
    tiles: {
      top: 'coal-ore',
      bottom: 'coal-ore',
      side: 'coal-ore',
    },
  },
  {
    key: 'ironOre',
    name: 'iron ore',
    collidable: true,
    breakable: true,
    occlusion: 'full',
    renderPass: 'opaque',
    dropItemKey: 'ironOre',
    emittedLightLevel: 0,
    durability: 2000,
    color: [0.69, 0.53, 0.41],
    tiles: {
      top: 'iron-ore',
      bottom: 'iron-ore',
      side: 'iron-ore',
    },
  },
  {
    key: 'goldOre',
    name: 'gold ore',
    collidable: true,
    breakable: true,
    occlusion: 'full',
    renderPass: 'opaque',
    dropItemKey: 'goldOre',
    emittedLightLevel: 0,
    durability: 2000,
    color: [0.86, 0.71, 0.24],
    tiles: {
      top: 'gold-ore',
      bottom: 'gold-ore',
      side: 'gold-ore',
    },
  },
  {
    key: 'diamondOre',
    name: 'diamond ore',
    collidable: true,
    breakable: true,
    occlusion: 'full',
    renderPass: 'opaque',
    dropItemKey: 'diamondOre',
    emittedLightLevel: 0,
    durability: 2000,
    color: [0.2, 0.78, 0.78],
    tiles: {
      top: 'diamond-ore',
      bottom: 'diamond-ore',
      side: 'diamond-ore',
    },
  },
  {
    key: 'glass',
    name: 'glass',
    collidable: true,
    breakable: true,
    occlusion: 'self',
    renderPass: 'translucent',
    dropItemKey: 'glass',
    emittedLightLevel: 0,
    durability: 600,
    color: [0.85, 0.93, 0.98],
    tiles: {
      top: 'glass',
      bottom: 'glass',
      side: 'glass',
    },
  },
  {
    key: 'playerArm',
    name: 'player arm',
    collidable: false,
    breakable: false,
    occlusion: 'none',
    renderPass: 'opaque',
    dropItemKey: null,
    emittedLightLevel: 0,
    durability: 0,
    color: [0.77, 0.61, 0.47],
    tiles: {
      top: 'arm',
      bottom: 'arm',
      side: 'arm',
    },
  },
] as const satisfies readonly AuthoredBlockSpec[]

export const AUTHORED_ITEM_SPECS = [
  {
    key: 'empty',
    name: 'empty',
    color: [0, 0, 0],
    maxStackSize: 0,
    placesBlockKey: null,
    renderBlockKey: null,
  },
  {
    key: 'grass',
    name: 'grass block',
    color: [0.42, 0.71, 0.31],
    maxStackSize: 64,
    placesBlockKey: 'grass',
    renderBlockKey: 'grass',
  },
  {
    key: 'dirt',
    name: 'dirt',
    color: [0.48, 0.34, 0.2],
    maxStackSize: 64,
    placesBlockKey: 'dirt',
    renderBlockKey: 'dirt',
  },
  {
    key: 'stone',
    name: 'stone',
    color: [0.5, 0.5, 0.56],
    maxStackSize: 64,
    placesBlockKey: 'stone',
    renderBlockKey: 'stone',
  },
  {
    key: 'log',
    name: 'log',
    color: [0.48, 0.37, 0.24],
    maxStackSize: 64,
    placesBlockKey: 'log',
    renderBlockKey: 'log',
  },
  {
    key: 'leaves',
    name: 'leaves',
    color: [0.32, 0.58, 0.22],
    maxStackSize: 64,
    placesBlockKey: 'leaves',
    renderBlockKey: 'leaves',
  },
  {
    key: 'sand',
    name: 'sand',
    color: [0.84, 0.78, 0.52],
    maxStackSize: 64,
    placesBlockKey: 'sand',
    renderBlockKey: 'sand',
  },
  {
    key: 'planks',
    name: 'planks',
    color: [0.72, 0.55, 0.31],
    maxStackSize: 64,
    placesBlockKey: 'planks',
    renderBlockKey: 'planks',
  },
  {
    key: 'cobblestone',
    name: 'cobblestone',
    color: [0.58, 0.58, 0.61],
    maxStackSize: 64,
    placesBlockKey: 'cobblestone',
    renderBlockKey: 'cobblestone',
  },
  {
    key: 'brick',
    name: 'brick',
    color: [0.69, 0.27, 0.22],
    maxStackSize: 64,
    placesBlockKey: 'brick',
    renderBlockKey: 'brick',
  },
  {
    key: 'glowstone',
    name: 'glowstone',
    color: [0.94, 0.79, 0.37],
    maxStackSize: 64,
    placesBlockKey: 'glowstone',
    renderBlockKey: 'glowstone',
  },
  {
    key: 'coalOre',
    name: 'coal ore',
    color: [0.31, 0.31, 0.33],
    maxStackSize: 64,
    placesBlockKey: 'coalOre',
    renderBlockKey: 'coalOre',
  },
  {
    key: 'ironOre',
    name: 'iron ore',
    color: [0.69, 0.53, 0.41],
    maxStackSize: 64,
    placesBlockKey: 'ironOre',
    renderBlockKey: 'ironOre',
  },
  {
    key: 'goldOre',
    name: 'gold ore',
    color: [0.86, 0.71, 0.24],
    maxStackSize: 64,
    placesBlockKey: 'goldOre',
    renderBlockKey: 'goldOre',
  },
  {
    key: 'diamondOre',
    name: 'diamond ore',
    color: [0.2, 0.78, 0.78],
    maxStackSize: 64,
    placesBlockKey: 'diamondOre',
    renderBlockKey: 'diamondOre',
  },
  {
    key: 'glass',
    name: 'glass',
    color: [0.85, 0.93, 0.98],
    maxStackSize: 64,
    placesBlockKey: 'glass',
    renderBlockKey: 'glass',
  },
] as const satisfies readonly AuthoredItemSpec[]

export const DEFAULT_STARTER_INVENTORY_STACK_SPECS = [
  {
    slot: 0,
    itemKey: 'grass',
    count: 64,
  },
  {
    slot: 1,
    itemKey: 'glowstone',
    count: 64,
  },
  {
    slot: 2,
    itemKey: 'dirt',
    count: 64,
  },
  {
    slot: 3,
    itemKey: 'stone',
    count: 64,
  },
  {
    slot: 4,
    itemKey: 'log',
    count: 64,
  },
  {
    slot: 5,
    itemKey: 'leaves',
    count: 64,
  },
  {
    slot: 7,
    itemKey: 'planks',
    count: 64,
  },
  {
    slot: 8,
    itemKey: 'cobblestone',
    count: 64,
  },
  {
    slot: 9,
    itemKey: 'glass',
    count: 64,
  },
] as const satisfies readonly StarterInventoryStackSpec[]
