import type { BlockId } from "../types.ts";
import type { ItemId } from "../types.ts";
import {
  ITEM_IDS,
  ITEM_ID_VALUES,
  type ItemId as GeneratedItemId,
  type ItemKey,
} from "./generated/content-ids.ts";
import {
  GENERATED_ITEM_DEFINITIONS,
  HOTBAR_ITEM_IDS,
  STARTER_MAIN_INVENTORY_STACKS,
} from "./generated/content-registry.ts";

export interface ItemDefinition {
  id: ItemId;
  name: string;
  color: [number, number, number];
  maxStackSize: number;
  placesBlockId: BlockId | null;
  renderBlockId: BlockId | null;
}

export { HOTBAR_ITEM_IDS, ITEM_IDS, STARTER_MAIN_INVENTORY_STACKS };
export type { ItemKey };

const ITEM_ID_SET = new Set<number>(ITEM_ID_VALUES);

export const Items: Record<ItemId, ItemDefinition> = GENERATED_ITEM_DEFINITIONS as Record<
  GeneratedItemId,
  ItemDefinition
>;

export const isValidItemId = (itemId: number): itemId is ItemId =>
  Number.isInteger(itemId) && ITEM_ID_SET.has(itemId);

export const getItemDefinition = (itemId: ItemId): ItemDefinition => Items[itemId];

export const getItemDisplayName = (itemId: ItemId): string => Items[itemId].name;

export const getItemColor = (itemId: ItemId): [number, number, number] => Items[itemId].color;

export const getItemMaxStackSize = (itemId: ItemId): number => Items[itemId].maxStackSize;

export const getPlacedBlockIdForItem = (itemId: ItemId): BlockId | null => Items[itemId].placesBlockId;

export const getItemRenderBlockId = (itemId: ItemId): BlockId | null => Items[itemId].renderBlockId;

export const isPlaceableItem = (itemId: ItemId): boolean => Items[itemId].placesBlockId !== null;
