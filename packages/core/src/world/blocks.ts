import type { BlockId, ItemId } from '../types.ts'
import type { AtlasTileId } from './atlas.ts'

import {
  BLOCK_IDS,
  type BlockKey,
  type BlockId as GeneratedBlockId,
} from './generated/content-ids.ts'
import { GENERATED_BLOCK_DEFINITIONS } from './generated/content-registry.ts'

export type BlockFaceRole = 'top' | 'bottom' | 'side'
export type BlockOcclusionMode = 'none' | 'full' | 'self'
export type BlockRenderPass = 'opaque' | 'cutout' | 'translucent'

export interface BlockTiles {
  top: AtlasTileId
  bottom: AtlasTileId
  side: AtlasTileId
}

export interface BlockDefinition {
  id: BlockId
  name: string
  collidable: boolean
  breakable: boolean
  occlusion: BlockOcclusionMode
  renderPass: BlockRenderPass | null
  dropItemId: ItemId | null
  emittedLightLevel: number
  durability: number
  color: [number, number, number]
  tiles?: BlockTiles
}

export { BLOCK_IDS }
export type { BlockKey }

const BLOCK_ID_SET = new Set<number>(Object.values(BLOCK_IDS))
const BLOCK_KEYS_BY_ID = Object.fromEntries(
  Object.entries(BLOCK_IDS).map(([key, blockId]) => [blockId, key]),
) as Record<BlockId, BlockKey>

export const Blocks: Record<BlockId, BlockDefinition> = GENERATED_BLOCK_DEFINITIONS as Record<
  GeneratedBlockId,
  BlockDefinition
>

export const isValidBlockId = (blockId: number): blockId is BlockId =>
  Number.isInteger(blockId) && BLOCK_ID_SET.has(blockId)

export const getBlockKey = (blockId: BlockId): BlockKey => BLOCK_KEYS_BY_ID[blockId]

export const isSolidBlock = (blockId: BlockId): boolean => Blocks[blockId].collidable

export const isBreakableBlock = (blockId: BlockId): boolean => Blocks[blockId].breakable

export const getDroppedItemIdForBlock = (blockId: BlockId): ItemId | null =>
  Blocks[blockId].dropItemId

export const getBlockEmittedLightLevel = (blockId: BlockId): number =>
  Blocks[blockId].emittedLightLevel

export const getBlockDurability = (blockId: BlockId): number => Blocks[blockId].durability

export const isCollectibleBlock = (blockId: BlockId): boolean =>
  getDroppedItemIdForBlock(blockId) !== null

export const getBlockRenderPass = (blockId: BlockId): BlockRenderPass | null =>
  Blocks[blockId].renderPass

export const doesBlockOccludeNeighborFace = (blockId: BlockId, neighborId: BlockId): boolean => {
  const neighbor = Blocks[neighborId]
  if (neighbor.occlusion === 'none') {
    return false
  }

  if (neighbor.occlusion === 'full') {
    return true
  }

  return blockId === neighborId
}

export const getBlockFaceTile = (blockId: BlockId, face: BlockFaceRole): AtlasTileId | null => {
  const tiles = Blocks[blockId].tiles
  return tiles ? tiles[face] : null
}
