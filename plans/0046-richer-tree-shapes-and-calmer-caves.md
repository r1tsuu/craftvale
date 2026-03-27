# Richer Tree Shapes And Calmer Caves

## Summary

Improve tree generation to produce taller, more layered, naturally varied canopies, and pull
back cave density so underground spaces feel like discoveries rather than constant erosion of
the surface. Both changes are data-driven through existing biome and terrain constants —
no new block types or content IDs are required.

## Goals

- Trees should look more like Minecraft oak/birch canopies: taller trunks, multi-layer tapered
  canopies, and per-tree seeded variation so no two trees look identical.
- Cave openings should still exist and feel exciting, but the surface crust should survive mostly
  intact so new players are not immediately confused by Swiss-cheese terrain.
- Keep all changes deterministic from the world seed.

## Non-Goals

- New tree species or biome-exclusive tree models (jungle, pine, etc.) are out of scope.
- Structural changes to how `BiomeDefinition` is consumed outside of tree generation.
- Any changes to ore generation, lighting, or meshing.

## Key Changes

### 1. Layered conical canopy model

Replace the current flat two-layer + cap approach with a layer-stack that reads from biome
config. Each layer is described by a Y offset relative to `trunkTopY` and an effective radius
for that layer. The general rule is:

- Bottom layer: widest radius, placed at `trunkTopY - 1`
- Upper layers: radius decreases by 1 per step upward, down to radius 1
- Cap block: always one block directly above the topmost leaf layer

For a `canopyRadiusBase = 3` forest tree this produces four leaf layers:

| Layer | Y offset | Radius     |
| ----- | -------- | ---------- |
| 0     | -1       | 3          |
| 1     | 0        | 2          |
| 2     | +1       | 2          |
| 3     | +2       | 1          |
| cap   | +3       | 0 (single) |

Corner blocks at each layer are included stochastically via a per-tree seeded hash so the
canopy silhouette is jagged rather than perfectly round. Specifically, for each layer, each
corner block at distance `> radius - 0.5` has a `50 %` chance of being emitted based on
`hash2dInt(tree.x + offsetX, tree.z + offsetZ, treeSeed)`.

### 2. Per-tree canopy radius variation

Biomes currently carry a single `canopyRadius: 1 | 2`. Replace this with:

```ts
canopyRadiusBase: number // base radius of the bottom leaf layer (1–3)
canopyRadiusVariance: number // each tree adds hash % (canopyRadiusVariance + 1) to the base
```

Suggested biome values:

| Biome     | canopyRadiusBase | canopyRadiusVariance |
| --------- | ---------------- | -------------------- |
| plains    | 2                | 0                    |
| forest    | 2                | 1                    |
| highlands | 1                | 0                    |
| scrub     | 1                | 0                    |

This allows forest trees to reach radius 3 for the biggest specimens while plains trees stay
compact at radius 2.

### 3. Taller trunk range

Extend biome trunk heights so canopy variation is visible:

| Biome     | trunkHeightMin | trunkHeightVariance |
| --------- | -------------- | ------------------- |
| plains    | 4              | 2                   |
| forest    | 4              | 3                   |
| highlands | 3              | 1                   |
| scrub     | 3              | 1                   |

`trunkHeight` is still capped by `TREE_MAX_TRUNK_HEIGHT` (currently 5 — raise to 7 to
accommodate the increased forest range without changing world height limits).

### 4. Expand structure radius for tree decoration

The current `structureRadius = 2` in `decorateChunkWithTrees` is based on the old
`canopyRadius ≤ 2`. With radius-3 canopies the leaf fringe can reach 3 blocks from the trunk.
Increase `structureRadius` to `4` so cross-chunk canopies generate consistently.

### 5. Trunk extends one block into canopy

For taller trees, make the trunk log column continue one block into the bottom leaf layer:

```
trunkBaseY  → trunkTopY + 1  (inclusive)
```

This matches the standard Minecraft oak look where the log continues through the canopy base.
The existing `setGeneratedBlockIfInChunk(chunk, tree.x, trunkTopY, tree.z, BLOCK_IDS.log)` call
already does this at the top; extend it one layer further:

```ts
for (let worldY = trunkBaseY; worldY <= trunkTopY + 1; worldY += 1) {
  setGeneratedBlockIfInChunk(chunk, tree.x, worldY, tree.z, BLOCK_IDS.log)
}
```

Leaf blocks never overwrite log blocks (existing `setGeneratedBlockIfInChunk` guard already
handles this correctly via the `leaves` special case).

---

### 6. Reduce surface entrance frequency

In `getSurfaceEntranceAnchorForCell`, the current gate:

```ts
if (cellSeed % 100 >= 45) return null // 45 % spawn rate
```

is very high — roughly one entrance per 40×40 block area. Reduce to a 20 % spawn rate and
increase the cell size so entrances are spaced further apart:

```ts
const SURFACE_ENTRANCE_CELL_SIZE = 56 // was 40
// inside getSurfaceEntranceAnchorForCell:
if (cellSeed % 100 >= 20) return null // was >= 45
```

This leaves surface entrances in the world but makes them feel like notable landmarks rather
than routine holes in the ground.

### 7. Raise the base cave carve threshold

In `shouldCarveCaveAt`, the current base threshold is `0.74`. Raise it to `0.77`:

```ts
let threshold = 0.77 // was 0.74
```

This trims approximately 15–20 % of cave volume from the existing noise field without
changing the cave shape vocabulary. Combined with the entrance-frequency reduction, terrain
should read as much more solid near the surface.

### 8. Strengthen near-surface protection

Tighten the near-surface threshold bumps so the first few blocks below ground are harder to
carve:

```ts
if (depthBelowSurface <= 0) {
  threshold += 0.06 - entranceBias * 0.14 // was 0.04 - 0.18
} else if (depthBelowSurface <= 2) {
  threshold += 0.03 - entranceBias * 0.08 // was 0.01 - 0.12
} else if (depthBelowSurface <= 6) {
  threshold += 0.04 // was 0.03
}
```

The deep-cave bonus (`depthBelowSurface >= 36`) remains unchanged so large deep caverns still
feel spacious.

---

## Important Files

| File                                 | Change                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------- |
| `packages/core/src/world/biomes.ts`  | Replace `canopyRadius` with `canopyRadiusBase` + `canopyRadiusVariance`; adjust trunk heights |
| `packages/core/src/world/terrain.ts` | Rewrite `decorateChunkWithTrees` canopy loop; adjust cave constants and thresholds            |

No content-spec, atlas, or generated-file changes are needed.

## BiomeDefinition interface delta

```ts
// Remove:
canopyRadius: 1 | 2

// Add:
canopyRadiusBase: number
canopyRadiusVariance: number
```

Update `TreeAnchor` to carry the resolved per-tree radius:

```ts
interface TreeAnchor {
  x: number
  z: number
  surfaceY: number
  trunkHeight: number
  canopyRadius: number // resolved value, not biome enum
}
```

## Canopy generation pseudocode

```ts
const canopyRadius = biome.canopyRadiusBase + ((cellSeed >>> 18) % (biome.canopyRadiusVariance + 1))
// ...
const trunkBaseY = tree.surfaceY + 1
const trunkTopY = trunkBaseY + tree.trunkHeight - 1

// Trunk through bottom leaf layer
for (let worldY = trunkBaseY; worldY <= trunkTopY + 1; worldY++) {
  setGeneratedBlockIfInChunk(chunk, tree.x, worldY, tree.z, BLOCK_IDS.log)
}

// Leaf layers: radius decreases from canopyRadius at trunkTopY-1 upward
const LAYER_OFFSETS = [-1, 0, 1, 2]
for (const yOffset of LAYER_OFFSETS) {
  const worldY = trunkTopY + yOffset
  const layerRadius = Math.max(1, canopyRadius - Math.max(0, yOffset))
  for (let oz = -layerRadius; oz <= layerRadius; oz++) {
    for (let ox = -layerRadius; ox <= layerRadius; ox++) {
      const dist = Math.hypot(ox, oz)
      if (dist > layerRadius + 0.5) continue
      if (dist > layerRadius - 0.5) {
        // corner: 50% chance based on per-tree hash
        const cornerHash = hash2dInt(tree.x + ox, tree.z + oz, cellSeed ^ (yOffset * 0x5e3f))
        if (cornerHash & 1) continue
      }
      setGeneratedBlockIfInChunk(chunk, tree.x + ox, worldY, tree.z + oz, BLOCK_IDS.leaves)
    }
  }
}

// Single cap block
setGeneratedBlockIfInChunk(chunk, tree.x, trunkTopY + 3, tree.z, BLOCK_IDS.leaves)
```

## Tests

### `tests/terrain.test.ts` — extend

```ts
test('forest tree canopy has at least 3 leaf layers', () => {
  // sample a chunk known to contain a forest tree; walk upward from surface
  // and confirm leaf blocks appear at 3 distinct Y levels above the trunk top
})

test('cave frequency: fewer than N cave blocks in surface-layer sample', () => {
  // generate 10 chunks at various seeds; count cave (air) blocks between Y=60 and Y=75
  // assert the count is below a threshold reflecting the calmer settings
})

test('surface entrances: fewer than 1 per 50-block horizontal span on average', () => {
  // scan a 400×400 area for surface openings; assert count stays below expected ceiling
})
```

## Suggested Implementation Order

1. Update `BiomeDefinition` interface (`canopyRadius` → `canopyRadiusBase`/`canopyRadiusVariance`).
2. Update all four biome definitions with new canopy and trunk values.
3. Rewrite `decorateChunkWithTrees` canopy loop using the new layered model.
4. Increase `TREE_MAX_TRUNK_HEIGHT` and `structureRadius`.
5. Update cave constants: `SURFACE_ENTRANCE_CELL_SIZE`, gate threshold, base carve threshold,
   near-surface bias.
6. Run `bun test` and check terrain tests pass.
7. Manual smoke test: new world should show taller, varied trees and a less pockmarked surface.

## Verification

1. `bun run typecheck` — no errors.
2. `bun test` — all existing and new terrain tests pass.
3. Manual: new world shows trees with 3–4 visible leaf layers and varied silhouettes.
4. Manual: surface should have occasional cave openings but not constant sinkholes every few
   chunks.
5. Manual: digging down still finds substantial underground cave networks.
6. Manual: cross-chunk canopy edges are continuous with no missing leaf columns at chunk seams.
