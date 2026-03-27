# Glass Block

## Summary

Add a Glass block — collidable, translucent, and breakable. Glass uses `renderPass: 'translucent'`
and `occlusion: 'self'` so it renders with alpha blending and does not occlude adjacent faces of
the same block type. The default starter inventory is updated: `glass` replaces `brick` in slot 9,
and `sand` is removed from slot 6, leaving slot 6 empty.

## Proposed Change

### 1. Block spec — `content-spec.ts`

Add a `glass` entry to `AUTHORED_BLOCK_SPECS`:

```ts
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
```

`occlusion: 'self'` means glass does not cull the faces of neighbouring glass blocks — the same
behaviour used by leaves and water — so adjacent glass panes remain individually visible.

### 2. Item spec — `content-spec.ts`

Add a `glass` entry to `AUTHORED_ITEM_SPECS`:

```ts
{
  key: 'glass',
  name: 'glass',
  color: [0.85, 0.93, 0.98],
  maxStackSize: 64,
  placesBlockKey: 'glass',
  renderBlockKey: 'glass',
},
```

### 3. Default starter inventory — `content-spec.ts`

Two changes to `DEFAULT_STARTER_INVENTORY_STACK_SPECS`:

- **Remove** the `sand` entry (slot 6) — slot 6 becomes empty.
- **Replace** the `brick` entry (slot 9) with `glass`.

Before:

| Slot | Item        |
| ---- | ----------- |
| 0    | grass       |
| 1    | glowstone   |
| 2    | dirt        |
| 3    | stone       |
| 4    | log         |
| 5    | leaves      |
| 6    | sand        |
| 7    | planks      |
| 8    | cobblestone |
| 9    | brick       |

After:

| Slot | Item        |
| ---- | ----------- |
| 0    | grass       |
| 1    | glowstone   |
| 2    | dirt        |
| 3    | stone       |
| 4    | log         |
| 5    | leaves      |
| 6    | _(empty)_   |
| 7    | planks      |
| 8    | cobblestone |
| 9    | glass       |

### 4. Atlas tile — `atlas.ts`

Add `'glass'` to the `AtlasTileId` union so the content-spec `tiles` field type-checks:

```ts
// packages/core/src/world/atlas.ts
export type AtlasTileId =
  | 'grass-top'
  | 'grass-side'
  | 'dirt'
  | 'stone'
  | 'bedrock'
  | 'log-top'
  | 'log-side'
  | 'leaves'
  | 'sand'
  | 'planks'
  | 'cobblestone'
  | 'brick'
  | 'glowstone'
  | 'water'
  | 'coal-ore'
  | 'iron-ore'
  | 'gold-ore'
  | 'diamond-ore'
  | 'arm'
  | 'glass' // ← new
```

### 5. Tile pixel factory — `default-voxel-tile-sources.ts`

Glass looks like a thin coloured frame with a mostly-transparent interior. The border pixels are
a soft icy-blue and fully opaque; interior pixels use a very low alpha (~30) so the block is
almost see-through but still has a faint tint.

```ts
const createGlassPixel = (x: number, y: number): Rgba => {
  const isBorder = x === 0 || y === 0 || x === 15 || y === 15
  if (isBorder) {
    return rgba(195, 224, 240, 230)
  }
  // Interior: nearly transparent faint blue tint
  const noise = hash2d(x, y, 0x3be8f1)
  const tintAmount = ((noise & 0x3) - 1) * 3
  return rgba(
    clampColor(200 + tintAmount),
    clampColor(230 + tintAmount),
    clampColor(245 + tintAmount),
    28,
  )
}
```

Register it in `DEFAULT_TILE_PIXEL_FACTORIES`:

```ts
glass: createGlassPixel,
```

### 6. Content generation

After all spec and atlas changes, run:

```
bun run generate:content
```

Review the diff in `packages/core/src/world/generated/`. The new `glass` block and item IDs will
be appended; `content-id-lock.json` should receive two new entries (`glass` block + `glass` item).

## Important Files

| File                                                     | Change                                                              |
| -------------------------------------------------------- | ------------------------------------------------------------------- |
| `packages/core/src/world/content-spec.ts`                | Add `glass` block spec, item spec; update default starter inventory |
| `packages/core/src/world/atlas.ts`                       | Add `'glass'` to `AtlasTileId`                                      |
| `apps/cli/src/default-voxel-tile-sources.ts`             | Add `createGlassPixel` and register in factory map                  |
| `packages/core/src/world/generated/content-registry.ts`  | Re-generated — do not hand-edit                                     |
| `packages/core/src/world/generated/content-id-lock.json` | Re-generated — do not hand-edit                                     |

## Tests

### `tests/content-spec.test.ts` — extend or create

```ts
test('glass block spec has translucent render pass and self occlusion', () => {
  const spec = AUTHORED_BLOCK_SPECS.find((b) => b.key === 'glass')
  expect(spec).toBeDefined()
  expect(spec!.renderPass).toBe('translucent')
  expect(spec!.occlusion).toBe('self')
  expect(spec!.collidable).toBe(true)
  expect(spec!.breakable).toBe(true)
})

test('glass item spec places the glass block', () => {
  const item = AUTHORED_ITEM_SPECS.find((i) => i.key === 'glass')
  expect(item).toBeDefined()
  expect(item!.placesBlockKey).toBe('glass')
})

test('default starter inventory slot 6 is empty', () => {
  const slot6 = DEFAULT_STARTER_INVENTORY_STACK_SPECS.find((s) => s.slot === 6)
  expect(slot6).toBeUndefined()
})

test('default starter inventory slot 9 is glass', () => {
  const slot9 = DEFAULT_STARTER_INVENTORY_STACK_SPECS.find((s) => s.slot === 9)
  expect(slot9?.itemKey).toBe('glass')
})

test('sand is not in default starter inventory', () => {
  const hasSand = DEFAULT_STARTER_INVENTORY_STACK_SPECS.some((s) => s.itemKey === 'sand')
  expect(hasSand).toBe(false)
})
```

### `tests/glass-tile.test.ts` — new file

```ts
import { buildDefaultVoxelTilePixels } from '../apps/cli/src/default-voxel-tile-sources.ts'
import { ATLAS_TILE_SIZE } from '../packages/core/src/world/atlas.ts'

const STRIDE = 4

test('glass tile border pixels are opaque', () => {
  const pixels = buildDefaultVoxelTilePixels('glass')
  // Top-left corner pixel (x=0, y=0)
  const alpha = pixels[3]
  expect(alpha).toBeGreaterThan(200)
})

test('glass tile interior pixels are nearly transparent', () => {
  const pixels = buildDefaultVoxelTilePixels('glass')
  // Interior pixel at (8, 8)
  const index = (8 + 8 * ATLAS_TILE_SIZE) * STRIDE
  const alpha = pixels[index + 3]
  expect(alpha).toBeLessThan(60)
})
```

## Out of Scope

- Silk-touch or special tool requirements — glass drops itself unconditionally.
- Pane/thin-panel geometry variant.
- Stained glass colour variants.
- Server-side special placement rules.

## Verification

1. `bun run generate:content` — runs cleanly; `content-id-lock.json` gains `glass` block and
   item entries; no existing IDs shift.
2. `bun run typecheck` — no errors.
3. `bun test` — all tests pass.
4. Manual: new world spawns with glass in hotbar slot 9; slot 6 is empty; sand is gone.
5. Manual: place glass — translucent block renders with see-through interior and soft blue border.
6. Manual: adjacent glass blocks do not cull each other's shared faces.
7. Manual: break glass — block removed after ~600 ms hold; glass item drops and can be picked up.
8. Manual: creative mode — glass breaks instantly.
