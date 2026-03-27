import {
  BLOCK_IDS,
  type BlockId,
  CHUNK_SIZE,
  type EntityId,
  getItemRenderBlockId,
  getSelectedInventorySlot,
  type InventorySnapshot,
  ITEM_IDS,
  type PlayerSnapshot,
} from '@craftvale/core/shared'

export interface CuboidPartDefinition {
  id: string
  blockId: BlockId
  size: readonly [number, number, number]
  offset: readonly [number, number, number]
  pitchFollowsLook?: boolean
}

export const PLAYER_HEAD_BLOCK_ID: BlockId = BLOCK_IDS.sand
export const PLAYER_TORSO_BLOCK_ID: BlockId = BLOCK_IDS.brick
export const PLAYER_ARM_BLOCK_ID: BlockId = BLOCK_IDS.playerArm
export const PLAYER_LEG_BLOCK_ID: BlockId = BLOCK_IDS.cobblestone

export const PLAYER_BODY_PARTS: readonly CuboidPartDefinition[] = [
  {
    id: 'head',
    blockId: PLAYER_HEAD_BLOCK_ID,
    size: [0.62, 0.62, 0.62],
    offset: [0, 1.5, 0],
    pitchFollowsLook: true,
  },
  {
    id: 'torso',
    blockId: PLAYER_TORSO_BLOCK_ID,
    size: [0.74, 0.72, 0.36],
    offset: [0, 0.97, 0],
  },
  {
    id: 'left-arm',
    blockId: PLAYER_ARM_BLOCK_ID,
    size: [0.22, 0.72, 0.22],
    offset: [-0.5, 0.97, 0],
  },
  {
    id: 'right-arm',
    blockId: PLAYER_ARM_BLOCK_ID,
    size: [0.22, 0.72, 0.22],
    offset: [0.5, 0.97, 0],
  },
  {
    id: 'left-leg',
    blockId: PLAYER_LEG_BLOCK_ID,
    size: [0.26, 0.78, 0.26],
    offset: [-0.18, 0.39, 0],
  },
  {
    id: 'right-leg',
    blockId: PLAYER_LEG_BLOCK_ID,
    size: [0.26, 0.78, 0.26],
    offset: [0.18, 0.39, 0],
  },
] as const

export const PLAYER_NAMEPLATE_HEIGHT = 2.15

export const FIRST_PERSON_ARM_PART: CuboidPartDefinition = {
  id: 'first-person-arm',
  blockId: PLAYER_ARM_BLOCK_ID,
  size: [0.14, 0.6, 0.14],
  offset: [0, 0, 0],
  pitchFollowsLook: true,
}

export const FIRST_PERSON_ARM_CAMERA_OFFSET = {
  right: 0.58,
  up: -0.44,
  forward: 0.5,
} as const

export const FIRST_PERSON_HELD_ITEM_CAMERA_OFFSET = {
  right: 0.5,
  up: -0.36,
  forward: 0.52,
} as const

export const FIRST_PERSON_ARM_ROLL = 0.35

export const FIRST_PERSON_HELD_ITEM_SCALE = 0.32

export const getFirstPersonSwingAmount = (progress: number): number => {
  const clamped = Math.min(Math.max(progress, 0), 1)
  return Math.sin(clamped * Math.PI)
}

export const collectVisibleRemotePlayers = (
  players: readonly PlayerSnapshot[],
  clientPlayerEntityId: EntityId | null,
  cameraPosition: readonly [number, number, number],
  renderDistance: number,
): PlayerSnapshot[] => {
  const cameraChunkX = Math.floor(cameraPosition[0] / CHUNK_SIZE)
  const cameraChunkZ = Math.floor(cameraPosition[2] / CHUNK_SIZE)

  return players
    .filter((player) => {
      if (!player.active || player.entityId === clientPlayerEntityId) {
        return false
      }

      const playerChunkX = Math.floor(player.state.position[0] / CHUNK_SIZE)
      const playerChunkZ = Math.floor(player.state.position[2] / CHUNK_SIZE)
      return (
        Math.abs(playerChunkX - cameraChunkX) <= renderDistance &&
        Math.abs(playerChunkZ - cameraChunkZ) <= renderDistance
      )
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

export const getHeldItemBlockId = (inventory: InventorySnapshot): BlockId | null => {
  const slot = getSelectedInventorySlot(inventory)
  if (slot.itemId === ITEM_IDS.empty || slot.count <= 0) {
    return null
  }

  return getItemRenderBlockId(slot.itemId)
}
