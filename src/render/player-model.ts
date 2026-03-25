import type { BlockId, EntityId, InventorySnapshot, PlayerSnapshot } from "../types.ts";
import { CHUNK_SIZE } from "../world/constants.ts";
import { getSelectedInventorySlot } from "../world/inventory.ts";
import { getItemRenderBlockId } from "../world/items.ts";

export interface CuboidPartDefinition {
  id: string;
  blockId: BlockId;
  size: readonly [number, number, number];
  offset: readonly [number, number, number];
  pitchFollowsLook?: boolean;
}

export const PLAYER_HEAD_BLOCK_ID: BlockId = 6;
export const PLAYER_TORSO_BLOCK_ID: BlockId = 9;
export const PLAYER_ARM_BLOCK_ID: BlockId = 6;
export const PLAYER_LEG_BLOCK_ID: BlockId = 8;

export const PLAYER_BODY_PARTS: readonly CuboidPartDefinition[] = [
  {
    id: "head",
    blockId: PLAYER_HEAD_BLOCK_ID,
    size: [0.62, 0.62, 0.62],
    offset: [0, 1.5, 0],
    pitchFollowsLook: true,
  },
  {
    id: "torso",
    blockId: PLAYER_TORSO_BLOCK_ID,
    size: [0.74, 0.72, 0.36],
    offset: [0, 0.97, 0],
  },
  {
    id: "left-arm",
    blockId: PLAYER_ARM_BLOCK_ID,
    size: [0.22, 0.72, 0.22],
    offset: [-0.5, 0.97, 0],
  },
  {
    id: "right-arm",
    blockId: PLAYER_ARM_BLOCK_ID,
    size: [0.22, 0.72, 0.22],
    offset: [0.5, 0.97, 0],
  },
  {
    id: "left-leg",
    blockId: PLAYER_LEG_BLOCK_ID,
    size: [0.26, 0.78, 0.26],
    offset: [-0.18, 0.39, 0],
  },
  {
    id: "right-leg",
    blockId: PLAYER_LEG_BLOCK_ID,
    size: [0.26, 0.78, 0.26],
    offset: [0.18, 0.39, 0],
  },
] as const;

export const PLAYER_NAMEPLATE_HEIGHT = 2.15;

export const FIRST_PERSON_ARM_PART: CuboidPartDefinition = {
  id: "first-person-arm",
  blockId: PLAYER_ARM_BLOCK_ID,
  size: [0.22, 0.72, 0.22],
  offset: [0, 0, 0],
  pitchFollowsLook: true,
};

export const FIRST_PERSON_ARM_CAMERA_OFFSET = {
  right: 0.34,
  up: -0.28,
  forward: 0.5,
} as const;

export const FIRST_PERSON_HELD_ITEM_CAMERA_OFFSET = {
  right: 0.2,
  up: -0.38,
  forward: 0.62,
} as const;

export const FIRST_PERSON_HELD_ITEM_SCALE = 0.28;

export const collectVisibleRemotePlayers = (
  players: readonly PlayerSnapshot[],
  clientPlayerEntityId: EntityId | null,
  cameraPosition: readonly [number, number, number],
  renderDistance: number,
): PlayerSnapshot[] => {
  const cameraChunkX = Math.floor(cameraPosition[0] / CHUNK_SIZE);
  const cameraChunkZ = Math.floor(cameraPosition[2] / CHUNK_SIZE);

  return players
    .filter((player) => {
      if (!player.active || player.entityId === clientPlayerEntityId) {
        return false;
      }

      const playerChunkX = Math.floor(player.state.position[0] / CHUNK_SIZE);
      const playerChunkZ = Math.floor(player.state.position[2] / CHUNK_SIZE);
      return (
        Math.abs(playerChunkX - cameraChunkX) <= renderDistance &&
        Math.abs(playerChunkZ - cameraChunkZ) <= renderDistance
      );
    })
    .sort((left, right) => left.name.localeCompare(right.name));
};

export const getHeldItemBlockId = (inventory: InventorySnapshot): BlockId | null => {
  const slot = getSelectedInventorySlot(inventory);
  if (slot.itemId === 0 || slot.count <= 0) {
    return null;
  }

  return getItemRenderBlockId(slot.itemId);
};
