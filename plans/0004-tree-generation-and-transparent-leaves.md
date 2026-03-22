# Tree Generation And Transparent Leaves

## Summary
Add simple procedural trees to generated terrain and extend voxel rendering so leaf textures can contain transparent pixels. The goal is to make the world feel less empty without introducing chunk-order bugs or a full translucent rendering system. Trees should be deterministic from the world seed, work across chunk boundaries, and render leaves with alpha-cutout transparency so canopy textures can have visible holes while keeping the existing crisp pixel-art look.

## Key Changes

### New block types and atlas tiles
- Extend the block set with at least:
  - log
  - leaves
- Expand the voxel atlas with new pixel-art tiles for:
  - log top
  - log side
  - leaves
- Keep the atlas layout fixed in code, as with the current terrain tiles.
- Author the leaves tile with transparent pixels in the PNG alpha channel so the renderer has real cutout data to sample.

### Block metadata beyond `solid`
- Replace the current "solid means everything" assumption with explicit block behavior fields.
- Separate these concerns in block definitions:
  - collision/placement solidity
  - face-occlusion behavior for meshing
  - render mode
- Add a small render-mode model such as:
  - opaque
  - cutout
- Leaves should render as cutout blocks and should not blindly hide all neighboring faces just because they may still count as a placed block for gameplay.
- Preserve the ability to cull leaf-to-leaf internal faces so dense canopies do not explode mesh size, while still allowing opaque faces behind leaf holes to remain visible when needed.

### Deterministic tree generation
- Extend terrain generation with a tree-placement pass derived entirely from the world seed and world-space coordinates.
- Do not place trees by mutating neighboring chunks after generation; that would make results depend on chunk load order.
- Instead, generate trees by sampling candidate tree anchors in and around the target chunk, then emit only the blocks that fall inside the chunk currently being built.
- Use simple rules for v1:
  - trees only spawn on grass surface blocks
  - trees require a small minimum spacing
  - trees use a short trunk plus a compact leaf canopy
  - trees skip positions that would clip outside the supported vertical build range
- Because the current world only uses `WORLD_LAYER_CHUNKS_Y = [0]` and `CHUNK_SIZE = 16`, constrain tree height/canopy size so all generated trees fit within that single vertical layer.

### Tree shape and structure rules
- Start with one tree family rather than a full biome system.
- Recommended default shape:
  - trunk height around 3-4 blocks
  - a small rounded or plus-shaped canopy around the trunk top
  - optional top leaf cap for silhouette variation
- Keep the structure deterministic but allow a little seeded variation in trunk height and canopy footprint so trees do not look perfectly copied.
- Ensure generated leaves do not replace trunk blocks and do not place underground.

### Chunk generation integration
- Keep `populateGeneratedChunk(...)` as the main entry point, but split the logic conceptually into:
  - terrain column fill
  - structure decoration pass
- Add helpers that can answer questions like:
  - whether a world-space column should host a tree
  - which voxels belong to that tree
- Make the decoration pass safe at chunk borders by scanning a small structure radius outside the local chunk bounds before writing in-bounds blocks.
- Continue returning a fully generated chunk without requiring a live `VoxelWorld` instance during generation.

### Meshing and visibility rules for cutout leaves
- Update chunk meshing so face visibility is based on block occlusion/render behavior, not only `solid`.
- Opaque blocks adjacent to leaves should usually keep their faces, since transparent leaf pixels can reveal what is behind them.
- Leaves next to other leaves may still cull shared internal faces to control overdraw and triangle count.
- Keep UV emission face-aware so logs can use distinct top/bottom vs side textures.
- If implementation stays simple, treat cutout leaves as full cube geometry with alpha-tested textures rather than introducing cross-plane billboard foliage.

### Rendering pipeline and shader behavior
- Extend the voxel shader to preserve sampled atlas alpha instead of forcing output alpha to `1.0`.
- Use alpha-cutout behavior in the fragment shader:
  - sample atlas RGBA
  - discard fragments below a small alpha threshold
  - multiply surviving RGB by the existing face shade value
- This pass should target cutout transparency only, not full semi-transparent blending/sorting.
- Keep the current directional face shading model.

### Opaque vs cutout draw organization
- Split terrain rendering into at least two logical buckets:
  - opaque voxel faces
  - cutout voxel faces
- Render opaque geometry first, then cutout geometry.
- This keeps the path ready for future transparent materials and avoids mixing very different visibility rules into one mesh blob.
- Mesh data may be represented either as:
  - separate `MeshData` objects per render mode
  - one mesh object with distinct ranges/buffers per pass
- Choose the smallest change that keeps the renderer explicit.

### Native bridge and GL state
- Confirm the native GL bridge exposes the state needed for the cutout path.
- For alpha-cutout leaves, blending is not required if the texture uses hard transparency and the shader discards low-alpha fragments.
- If any GL state changes are introduced for the leaf pass, keep them local to voxel rendering and avoid affecting highlight/text/UI rendering.

## Important Public Interfaces/Types
- `BlockId` expands to include log and leaves.
- `BlockDefinition` gains explicit render/occlusion behavior rather than only `solid`.
- Atlas tile IDs/layout expand for wood and leaves.
- Terrain generation gains deterministic structure helpers for tree sampling and voxel emission.
- Chunk mesh/build outputs gain an explicit opaque/cutout distinction, or an equivalent render-pass-aware representation.

## Test Plan
- Terrain generation tests:
  - tree placement is deterministic for a fixed seed
  - different seeds produce different tree layouts
  - trees only spawn on valid grass surface positions
  - trees near chunk borders generate consistently regardless of which chunk is requested first
  - trees never write outside the supported vertical world range
- Mesher tests:
  - logs use the correct side and top atlas tiles
  - leaves emit cutout faces with the expected atlas UVs
  - opaque faces next to leaves are not incorrectly culled
  - adjacent leaves still cull internal faces if that rule is adopted
- Shader/renderer tests:
  - voxel shader keeps atlas alpha and discards below threshold
  - opaque and cutout terrain passes both compile and draw with the expected vertex layout
  - renderer keeps text, UI, and highlight paths unaffected
- Asset/atlas tests:
  - atlas dimensions and tile mapping still match code constants
  - the leaves tile contains transparent pixels in decoded image data
- Manual validation:
  - generated terrain includes scattered trees
  - trees look continuous across chunk seams
  - leaf holes reveal trunks/terrain behind them instead of showing missing geometry
  - leaves retain crisp pixel edges with no obvious atlas bleeding

## Assumptions And Defaults
- Use alpha-cutout transparency for leaves, not depth-sorted semi-transparent blending.
- Trees are decorative world-generation structures only in this pass; no growth/decay/biome system yet.
- Keep a single tree style for v1 and optimize for deterministic generation over variety.
- The current one-layer vertical world stays unchanged; tree dimensions must fit within it.
- Use the next plan filename in sequence: `0004-tree-generation-and-transparent-leaves.md`.
