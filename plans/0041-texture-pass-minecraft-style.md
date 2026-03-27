# Texture Pass — Minecraft-Style Tile Improvements

## Summary

The procedurally-generated atlas tiles look noticeably different from Minecraft's
iconic 16×16 art style. Stone is the most obvious offender — it reads as flat
grey noise with no character — but nearly every tile has issues: cobblestone uses
a rigid rectangular grid rather than organic rounded stones, grass lacks contrast,
log bark looks mechanically striped, and leaves have no readable cluster shape.
This plan rewrites every tile factory to match Minecraft's visual signature while
keeping the same pure-pixel-factory, no-external-assets approach.

## Problems Per Tile

### Stone

Current implementation applies uniform random brightness scatter around a
blue-grey base. Minecraft stone has a **speckled two-tone** appearance: a
mid-grey field (~`rgb(125, 125, 125)`) broken up by small irregular **darker-grey
blobs** (roughly −20 brightness) arranged in a characteristic organic pattern
that reads as mineral grain. There are no bright highlights; contrast is driven
entirely by the darker blobs.

Fixes:

- Remove the blue channel offset (neutral grey base, all three channels equal).
- Replace single-hash scatter with a **two-layer blob pattern**: hash at 2×2
  pixel granularity to decide if a given region belongs to a "dark vein", then
  add per-pixel micro-noise on top.
- Typical Minecraft stone pixel values range from about `rgb(100,100,100)` to
  `rgb(140,140,140)` with darker blobs as low as `rgb(80,80,80)`.

### Cobblestone

Current implementation divides the tile into a uniform 4×4 grid of equal-sized
cells with flat single-colour fills. Minecraft cobblestone has **irregularly
shaped rounded stones** in a 3-column layout per row, with proper mortar in the
gaps and each stone individually shaded (lighter centre, darker edges) to convey
roundness.

Fixes:

- Replace grid with a **Voronoi-style layout**: define stone centre points per
  row/column using hash-jittered offsets so stones vary in width from roughly 4
  to 7 pixels.
- Compute per-pixel distance to nearest stone centre to drive edge darkening
  (distance > threshold → mortar colour; near-threshold → shadow; centre → stone
  base with per-stone brightness variation).
- Use a warm dark-grey mortar (~`rgb(78,78,80)`) and stone base ~`rgb(122,122,
122)` with ±15 per-stone variation.

### Dirt

Current dirt is close but looks too smooth. Minecraft dirt has:

- Slightly more saturated mid-brown base (~`rgb(134,96,67)`)
- Scattered small **dark specks** simulating pebbles/organic matter (1–2 pixel
  dark blobs, not just single random pixels)
- Occasional slightly lighter sandy clumps

Fixes:

- Increase base saturation slightly.
- Use a 2×2 block granularity check to add pebble-sized dark specks.
- Add a subtle highlight cluster pattern for sandy spots.

### Grass Top

Current grass top has a weak checkerboard shade and scattered bright/dark
pixels. Minecraft classic grass has:

- Brighter, more saturated green (~`rgb(94,157,52)`)
- A clear **fine-grain dither** pattern at the 1-pixel level alternating between
  two shades of green
- Occasional single-pixel-wide blade highlights

Fixes:

- Shift base colour toward Minecraft's characteristic mid-green.
- Replace the current shade expression with a two-tone dither: even pixels get
  the base, odd pixels get base +8, with rare bright (+20) and dark (−14) single
  pixels sprinkled in via hash.

### Grass Side

The current implementation uses `createGrassTopPixel` for the top 4 rows, which
is reasonable, but the transition to dirt at row 4 is too abrupt. Minecraft
grass-side has:

- A 3-row green band at the top that grades into a single transition row of
  olive/dark green
- A clear dirt body with no dark stripe artefacts

Fixes:

- Keep green top band (rows 0–2), row 3 as transition (tint −10 on dirt colour
  with slight green mix), rows 4+ as clean dirt.
- Remove the current random dark streak in the mid-body region.

### Sand

Sand is adequate but slightly too uniform. Minecraft sand:

- Base close to `rgb(219,207,163)`
- Fine per-pixel variation (~±8) with occasional slightly larger lighter or
  darker patches (3×3 soft blob)

Fixes:

- Adjust base to the more cream-yellow Minecraft value.
- Add a soft-blob layer using 3×3 averaged noise to simulate grain clusters
  rather than pure per-pixel scatter.

### Log Side

Current bark uses a mechanical `stripe = (x * 3 + ...) % 5` pattern that looks
like ruled lines. Minecraft oak bark has:

- Near-uniform dark brown base (~`rgb(102,81,51)`)
- Subtle **vertical grain variation** driven by per-column hash (not a formula
  stripe), giving 2–4 pixel wide natural-looking vertical fibres
- Occasional knot suggestion: a 1–2 pixel horizontal darker dash roughly mid-tile

Fixes:

- Replace the modulo stripe with a per-column hash seed giving per-column
  brightness offset (±12).
- Add per-row micro-variation (±4) on top.
- Add a single subtle knot region (rows 6–9, columns decided by hash) that
  applies an additional −8 tint.

### Log Top

Log top is already reasonably close with its concentric ring approach. Minor
improvements:

- Increase ring contrast slightly (±18 instead of ±14) for a richer cross-cut
  look.
- Narrow the outer bark band (distance > 6.2 instead of 5.9) to use the darker
  bark colour more sparingly.

### Leaves

Current leaves use fully-random transparent holes. Minecraft oak leaves have:

- A **clustered** pattern where transparency holes tend to form 2×2 or irregular
  groups rather than single isolated pixels.
- A darker, slightly more saturated green than grass-top (~`rgb(59,118,44)`).
- Edges have a slight shadow (border pixels occasionally darkened).

Fixes:

- Drive transparency from a 2×2 region hash rather than per-pixel, so holes
  cluster naturally.
- Adjust base colour.
- Keep edge darkening logic.

### Planks

Current planks use 4-row bands with a simple alternating shade which is close to
Minecraft but lacks grain richness. Minecraft oak planks have:

- Stronger alternating band contrast (lighter/darker bands more pronounced)
- Visible wood **grain lines** — thin 1-pixel vertical streaks of slightly
  lighter colour spaced irregularly across the plank, not just alternating bands
- Gap grooves at band edges that are clearly darker

Fixes:

- Increase band contrast (±12 instead of current ±8/−6).
- Add per-column hash-driven vertical grain streaks (+8 on ~1 in 5 columns).
- Make the groove pixels visibly darker (−28 instead of −20).

### Bedrock

Bedrock is mostly fine for a bottom-of-world block but the current pattern at the
border pixels is subtle. Small improvement:

- Replace the edge-darkening with an occasional irregular dark inclusion (same
  approach as stone blobs) to break up the uniform scatter.

### Glowstone

Current glowstone is reasonable. Minor adjustment:

- The bright-centre region (`x > 4 && x < 11`) creates an obvious square glow.
  Replace with a radial distance check from the tile centre for a more natural
  circular glow bloom.

### Ores (Coal, Iron, Gold, Diamond)

The ore pixel factory is shared and uses the stone base as background. The
current fleck placement is fine but the fleck colour should be more accurate:

- Coal ore: fleck `rgb(60,60,64)` (nearly black, blending with stone)
- Iron ore: fleck `rgb(209,168,128)` (warm beige, clearly visible)
- Gold ore: fleck `rgb(255,220,80)` (bright gold)
- Diamond ore: fleck `rgb(92,230,230)` (bright cyan)

The fleck shape should be a **plus/cross shape** (1 centre + 4 neighbours) rather
than the current single isolated pixels, giving the characteristic ore-vein look.

## Key Changes

### Single file change

All changes are in `apps/cli/src/default-voxel-tile-sources.ts`. No new files,
no new atlas tiles, no content registry changes, no shader changes. The atlas
PNG is regenerated automatically when `bun run build:native` runs the tile
pipeline.

### Shared helper additions

Add two small helpers to the top of the file alongside existing `hash2d`/`tint`:

```ts
// Returns a jittered float in [−0.5, 0.5] for a given cell and axis
const hash2dFloat = (x: number, y: number, seed: number): number =>
  (hash2d(x, y, seed) & 0xff) / 255 - 0.5

// Returns the value from a 2D Gaussian-style soft blob centred at (cx, cy)
const blobWeight = (x: number, y: number, cx: number, cy: number, r: number): number => {
  const dx = x - cx,
    dy = y - cy
  return Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy) / r)
}
```

These allow dirt's soft pebble blobs and cobblestone's stone-centre highlight
without complex per-pixel logic.

## Pixel Value Reference (Minecraft Classic)

| Tile              | Base colour        | Dark accent             | Light accent           |
| ----------------- | ------------------ | ----------------------- | ---------------------- |
| Stone             | `rgb(125,125,125)` | `rgb(82,82,82)`         | none                   |
| Cobblestone stone | `rgb(119,119,119)` | stone edge shadow       | mortar `rgb(75,75,75)` |
| Dirt              | `rgb(134,96,67)`   | `rgb(100,72,50)`        | `rgb(155,115,80)`      |
| Grass top         | `rgb(88,147,48)`   | `rgb(68,112,38)`        | `rgb(110,170,60)`      |
| Sand              | `rgb(219,207,163)` | `rgb(195,183,140)`      | `rgb(235,225,185)`     |
| Log side          | `rgb(102,81,51)`   | `rgb(78,62,38)`         | `rgb(118,98,64)`       |
| Leaves            | `rgb(59,118,44)`   | transparent             | none                   |
| Planks            | `rgb(162,130,78)`  | groove `rgb(108,88,54)` | band `rgb(178,144,88)` |

## Important Files

- `plans/0041-texture-pass-minecraft-style.md`
- `apps/cli/src/default-voxel-tile-sources.ts` — all pixel factory functions
- `apps/client/assets/textures/voxel-atlas.png` — regenerated output (binary,
  committed after running the tile pipeline)
- `apps/client/assets/textures/tiles-src/` — source PNGs (regenerated at
  build time, not hand-edited)

## Out of Scope

- Animated tiles (water currently has no animation; that remains unchanged)
- Texture atlases larger than 4×5 tiles
- New tile types (no new blocks added in this plan)
- Biome-specific tinting (grass green hardcoded regardless of biome)
- Normal / specular maps

## Test Plan

- Run `bun run build:native` and confirm atlas regenerates without errors.
- Visual check in-game for each tile:
  - **Stone**: grey with dark irregular blobs, no blue cast, no bright speckling
  - **Cobblestone**: organic rounded stones, visible mortar, each stone shaded
    with lighter centre
  - **Dirt**: warm brown, small dark pebble clusters visible, no banding
  - **Grass top**: bright saturated green, fine dither, no obvious stripes
  - **Grass side**: clean green band at top grading naturally into dirt
  - **Sand**: cream-yellow, subtle grain clusters, not flat
  - **Log side**: vertical fibres, no ruled-line artefact, subtle knot
  - **Log top**: clear concentric rings, bark ring properly bounded
  - **Leaves**: holes cluster in groups, no isolated single-pixel scatter
  - **Planks**: strong band contrast, thin grain lines, dark grooves
  - **Ores**: ore flecks clearly visible as cross-shaped marks on stone background
- Regression: item overlay renders each block correctly in the hotbar
- Regression: `playerArm` tile (arm skin) unchanged — its factory is not
  touched by this plan
