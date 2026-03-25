import type { BlockId, ChunkCoord, DroppedItemSnapshot, EntityId, ItemId, PlayerSnapshot } from "../types.ts";
import { isSolidBlock } from "../world/blocks.ts";
import { worldToChunkCoord } from "../world/world.ts";
import type { AddedInventoryItemResult } from "./player-system.ts";
import type { WorldEntityState } from "./world-entity-state.ts";
import type { WorldStorage } from "./world-storage.ts";

const GRAVITY = 16;
const PICKUP_RADIUS = 1.35;
const PICKUP_RADIUS_SQUARED = PICKUP_RADIUS * PICKUP_RADIUS;
const PICKUP_COOLDOWN_MS = 250;
const ITEM_HALF_EXTENT = 0.18;
const GROUND_FRICTION = 0.82;
const AIR_DRAG = 0.98;

export interface DroppedItemInventoryUpdate {
  playerEntityId: EntityId;
  inventory: AddedInventoryItemResult["inventory"];
}

export interface DroppedItemSimulationResult {
  spawned: DroppedItemSnapshot[];
  updated: DroppedItemSnapshot[];
  removed: EntityId[];
  inventoryUpdates: DroppedItemInventoryUpdate[];
}

const emptySimulationResult = (): DroppedItemSimulationResult => ({
  spawned: [],
  updated: [],
  removed: [],
  inventoryUpdates: [],
});

const chunkKey = ({ x, y, z }: ChunkCoord): string => `${x},${y},${z}`;

const cloneVec3 = (
  value: readonly [number, number, number],
): [number, number, number] => [value[0], value[1], value[2]];

const extractEntitySequence = (entityId: EntityId): number => {
  const sequence = Number(entityId.split(":").at(-1) ?? "0");
  return Number.isFinite(sequence) ? sequence : 0;
};

export class DroppedItemSystem {
  private readonly chunkIndex = new Map<string, Set<EntityId>>();
  private loadPromise: Promise<void> | null = null;
  private saveDirty = false;

  public constructor(
    private readonly worldName: string,
    private readonly storage: WorldStorage,
    private readonly entities: WorldEntityState,
    private readonly getBlock: (x: number, y: number, z: number) => BlockId,
  ) {}

  public async getDroppedItemSnapshots(): Promise<DroppedItemSnapshot[]> {
    await this.ensureLoaded();
    return this.collectSnapshots();
  }

  public async spawnBlockDrop(
    itemId: ItemId,
    count: number,
    position: readonly [number, number, number],
  ): Promise<DroppedItemSimulationResult> {
    await this.ensureLoaded();
    const item = this.createDroppedItem(itemId, count, position);
    this.saveDirty = true;
    return {
      ...emptySimulationResult(),
      spawned: [item],
    };
  }

  public async update(
    deltaSeconds: number,
    players: readonly PlayerSnapshot[],
    addInventoryItem: (
      entityId: EntityId,
      itemId: ItemId,
      count: number,
    ) => AddedInventoryItemResult,
  ): Promise<DroppedItemSimulationResult> {
    await this.ensureLoaded();

    if (deltaSeconds <= 0 && players.length === 0) {
      return emptySimulationResult();
    }

    const result = emptySimulationResult();
    const removedEntityIds = new Set<EntityId>();
    const updatedEntityIds = new Set<EntityId>();
    const cooldownDeltaMs = deltaSeconds * 1000;

    for (const [entityId, transform] of this.entities.droppedItemTransform.entries()) {
      const stack = this.entities.droppedItemStack.require(entityId, "dropped item stack");
      const lifecycle = this.entities.droppedItemLifecycle.require(entityId, "dropped item lifecycle");
      let changed = false;
      const nextPosition = cloneVec3(transform.position);
      const nextVelocity = cloneVec3(transform.velocity);
      let nextPickupCooldownMs = lifecycle.pickupCooldownMs;

      if (nextPickupCooldownMs > 0) {
        nextPickupCooldownMs = Math.max(0, nextPickupCooldownMs - cooldownDeltaMs);
        changed = changed || nextPickupCooldownMs !== lifecycle.pickupCooldownMs;
      }

      if (deltaSeconds > 0) {
        nextVelocity[1] -= GRAVITY * deltaSeconds;
        nextPosition[0] += nextVelocity[0] * deltaSeconds;
        nextPosition[1] += nextVelocity[1] * deltaSeconds;
        nextPosition[2] += nextVelocity[2] * deltaSeconds;

        const belowY = Math.floor(nextPosition[1] - ITEM_HALF_EXTENT - 0.01);
        const belowBlockId = this.getBlock(
          Math.floor(nextPosition[0]),
          belowY,
          Math.floor(nextPosition[2]),
        );

        if (isSolidBlock(belowBlockId)) {
          const floorCenterY = belowY + 1 + ITEM_HALF_EXTENT;
          if (nextPosition[1] < floorCenterY) {
            nextPosition[1] = floorCenterY;
            nextVelocity[1] = 0;
          }
          nextVelocity[0] *= GROUND_FRICTION;
          nextVelocity[2] *= GROUND_FRICTION;
        } else {
          nextVelocity[0] *= AIR_DRAG;
          nextVelocity[2] *= AIR_DRAG;
        }

        changed =
          changed ||
          nextPosition[0] !== transform.position[0] ||
          nextPosition[1] !== transform.position[1] ||
          nextPosition[2] !== transform.position[2] ||
          nextVelocity[0] !== transform.velocity[0] ||
          nextVelocity[1] !== transform.velocity[1] ||
          nextVelocity[2] !== transform.velocity[2];
      }

      if (changed) {
        this.entities.droppedItemTransform.set(entityId, {
          position: nextPosition,
          velocity: nextVelocity,
        });
        this.entities.droppedItemLifecycle.set(entityId, {
          pickupCooldownMs: nextPickupCooldownMs,
        });
        this.reindexItem(entityId, transform.position, nextPosition);
        this.saveDirty = true;
        updatedEntityIds.add(entityId);
      }

      if (stack.count <= 0) {
        removedEntityIds.add(entityId);
      }
    }

    for (const player of players) {
      const nearbyEntityIds = this.getNearbyItemEntityIds(player.state.position);
      for (const entityId of nearbyEntityIds) {
        if (removedEntityIds.has(entityId)) {
          continue;
        }

        const transform = this.entities.droppedItemTransform.get(entityId);
        const stack = this.entities.droppedItemStack.get(entityId);
        const lifecycle = this.entities.droppedItemLifecycle.get(entityId);
        if (!transform || !stack || !lifecycle || lifecycle.pickupCooldownMs > 0) {
          continue;
        }

        if (this.getDistanceSquared(player.state.position, transform.position) > PICKUP_RADIUS_SQUARED) {
          continue;
        }

        const added = addInventoryItem(player.entityId, stack.itemId, stack.count);
        if (added.added <= 0) {
          continue;
        }

        result.inventoryUpdates.push({
          playerEntityId: player.entityId,
          inventory: added.inventory,
        });
        this.saveDirty = true;

        if (added.remaining <= 0) {
          removedEntityIds.add(entityId);
          continue;
        }

        this.entities.droppedItemStack.set(entityId, {
          itemId: stack.itemId,
          count: added.remaining,
        });
        updatedEntityIds.add(entityId);
      }
    }

    for (const entityId of removedEntityIds) {
      const transform = this.entities.droppedItemTransform.get(entityId);
      if (transform) {
        this.removeFromChunkIndex(entityId, transform.position);
      }
      this.entities.droppedItemTransform.delete(entityId);
      this.entities.droppedItemStack.delete(entityId);
      this.entities.droppedItemLifecycle.delete(entityId);
      this.entities.registry.destroyEntity(entityId);
      result.removed.push(entityId);
    }

    for (const entityId of updatedEntityIds) {
      if (removedEntityIds.has(entityId)) {
        continue;
      }

      result.updated.push(this.getSnapshot(entityId));
    }

    return result;
  }

  public async save(): Promise<void> {
    await this.ensureLoaded();
    if (!this.saveDirty) {
      return;
    }

    await this.storage.saveDroppedItems(this.worldName, this.collectSnapshots());
    this.saveDirty = false;
  }

  private async ensureLoaded(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.loadPersistedItems();
    }
    await this.loadPromise;
  }

  private async loadPersistedItems(): Promise<void> {
    const storedItems = await this.storage.loadDroppedItems(this.worldName);

    for (const item of storedItems) {
      if (this.entities.registry.has(item.entityId)) {
        throw new Error(`Duplicate dropped item entity id "${item.entityId}" in world "${this.worldName}".`);
      }

      this.entities.registry.registerExistingEntity(item.entityId);
      this.entities.droppedItemTransform.set(item.entityId, {
        position: cloneVec3(item.position),
        velocity: cloneVec3(item.velocity),
      });
      this.entities.droppedItemStack.set(item.entityId, {
        itemId: item.itemId,
        count: item.count,
      });
      this.entities.droppedItemLifecycle.set(item.entityId, {
        pickupCooldownMs: item.pickupCooldownMs,
      });
      this.addToChunkIndex(item.entityId, item.position);
    }
  }

  private createDroppedItem(
    itemId: ItemId,
    count: number,
    position: readonly [number, number, number],
  ): DroppedItemSnapshot {
    const entityId = this.entities.registry.createEntity("drop");
    const sequence = extractEntitySequence(entityId);
    const angle = sequence * 2.399963229728653;
    const velocity: [number, number, number] = [
      Math.cos(angle) * 1.1,
      2.4,
      Math.sin(angle) * 1.1,
    ];
    const spawnPosition: [number, number, number] = [
      position[0],
      position[1],
      position[2],
    ];

    this.entities.droppedItemTransform.set(entityId, {
      position: spawnPosition,
      velocity,
    });
    this.entities.droppedItemStack.set(entityId, {
      itemId,
      count: Math.max(1, Math.trunc(count)),
    });
    this.entities.droppedItemLifecycle.set(entityId, {
      pickupCooldownMs: PICKUP_COOLDOWN_MS,
    });
    this.addToChunkIndex(entityId, spawnPosition);

    return this.getSnapshot(entityId);
  }

  private collectSnapshots(): DroppedItemSnapshot[] {
    const items: DroppedItemSnapshot[] = [];

    for (const [entityId] of this.entities.droppedItemStack.entries()) {
      items.push(this.getSnapshot(entityId));
    }

    items.sort((left, right) => left.entityId.localeCompare(right.entityId));
    return items;
  }

  private getSnapshot(entityId: EntityId): DroppedItemSnapshot {
    const transform = this.entities.droppedItemTransform.require(entityId, "dropped item transform");
    const stack = this.entities.droppedItemStack.require(entityId, "dropped item stack");
    const lifecycle = this.entities.droppedItemLifecycle.require(entityId, "dropped item lifecycle");
    return {
      entityId,
      position: cloneVec3(transform.position),
      velocity: cloneVec3(transform.velocity),
      itemId: stack.itemId,
      count: stack.count,
      pickupCooldownMs: lifecycle.pickupCooldownMs,
    };
  }

  private addToChunkIndex(entityId: EntityId, position: readonly [number, number, number]): void {
    const key = chunkKey(worldToChunkCoord(position[0], position[1], position[2]).chunk);
    const bucket = this.chunkIndex.get(key);
    if (bucket) {
      bucket.add(entityId);
      return;
    }

    this.chunkIndex.set(key, new Set([entityId]));
  }

  private removeFromChunkIndex(entityId: EntityId, position: readonly [number, number, number]): void {
    const key = chunkKey(worldToChunkCoord(position[0], position[1], position[2]).chunk);
    const bucket = this.chunkIndex.get(key);
    if (!bucket) {
      return;
    }

    bucket.delete(entityId);
    if (bucket.size === 0) {
      this.chunkIndex.delete(key);
    }
  }

  private reindexItem(
    entityId: EntityId,
    previousPosition: readonly [number, number, number],
    nextPosition: readonly [number, number, number],
  ): void {
    const previousKey = chunkKey(worldToChunkCoord(
      previousPosition[0],
      previousPosition[1],
      previousPosition[2],
    ).chunk);
    const nextKey = chunkKey(worldToChunkCoord(nextPosition[0], nextPosition[1], nextPosition[2]).chunk);
    if (previousKey === nextKey) {
      return;
    }

    this.removeFromChunkIndex(entityId, previousPosition);
    this.addToChunkIndex(entityId, nextPosition);
  }

  private getNearbyItemEntityIds(position: readonly [number, number, number]): EntityId[] {
    const center = worldToChunkCoord(position[0], position[1], position[2]).chunk;
    const entityIds = new Set<EntityId>();

    for (let chunkZ = center.z - 1; chunkZ <= center.z + 1; chunkZ += 1) {
      for (let chunkY = center.y - 1; chunkY <= center.y + 1; chunkY += 1) {
        for (let chunkX = center.x - 1; chunkX <= center.x + 1; chunkX += 1) {
          const bucket = this.chunkIndex.get(chunkKey({ x: chunkX, y: chunkY, z: chunkZ }));
          if (!bucket) {
            continue;
          }

          for (const entityId of bucket) {
            entityIds.add(entityId);
          }
        }
      }
    }

    return [...entityIds];
  }

  private getDistanceSquared(
    playerPosition: readonly [number, number, number],
    itemPosition: readonly [number, number, number],
  ): number {
    const dx = playerPosition[0] - itemPosition[0];
    const dy = (playerPosition[1] + 0.9) - itemPosition[1];
    const dz = playerPosition[2] - itemPosition[2];
    return (dx * dx) + (dy * dy) + (dz * dz);
  }
}
