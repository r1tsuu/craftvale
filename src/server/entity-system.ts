import type { EntityId } from "../types.ts";

const DEFAULT_ENTITY_PREFIX = "entity";
const ENTITY_ID_PATTERN = /^([a-z][a-z0-9-]*):(\d+)$/i;

const extractEntitySequence = (entityId: EntityId): number | null => {
  const match = ENTITY_ID_PATTERN.exec(entityId);
  if (!match) {
    return null;
  }

  const sequence = Number(match[2]);
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : null;
};

export class EntityRegistry {
  private readonly entities = new Set<EntityId>();
  private nextSequence = 1;

  public createEntity(prefix = DEFAULT_ENTITY_PREFIX): EntityId {
    let entityId: EntityId;
    do {
      entityId = `${prefix}:${this.nextSequence}`;
      this.nextSequence += 1;
    } while (this.entities.has(entityId));

    this.entities.add(entityId);
    return entityId;
  }

  public registerExistingEntity(entityId: EntityId): void {
    this.entities.add(entityId);
    const sequence = extractEntitySequence(entityId);
    if (sequence !== null) {
      this.nextSequence = Math.max(this.nextSequence, sequence + 1);
    }
  }

  public has(entityId: EntityId): boolean {
    return this.entities.has(entityId);
  }

  public destroyEntity(entityId: EntityId): void {
    this.entities.delete(entityId);
  }
}

export class ComponentStore<T> {
  private readonly components = new Map<EntityId, T>();

  public get(entityId: EntityId): T | undefined {
    return this.components.get(entityId);
  }

  public require(entityId: EntityId, label: string): T {
    const component = this.components.get(entityId);
    if (!component) {
      throw new Error(`Missing ${label} for entity "${entityId}".`);
    }

    return component;
  }

  public set(entityId: EntityId, component: T): void {
    this.components.set(entityId, component);
  }

  public delete(entityId: EntityId): void {
    this.components.delete(entityId);
  }

  public entries(): IterableIterator<[EntityId, T]> {
    return this.components.entries();
  }
}
