# UV Atlas Texture Support

## Summary

Add textured voxel rendering using a shared UV atlas and original 16x16 pixel-art textures for grass, dirt, and stone. Replace the current solid-color voxel shading path with texture sampling plus the existing directional face shading so blocks keep their readable lighting while gaining a more Minecraft-like look.

## Key Changes

### Texture atlas and art assets

- Add a single voxel atlas asset containing 16x16 tiles for:
  - grass top
  - grass side
  - dirt
  - stone
- Keep the textures original and Minecraft-inspired, with crisp nearest-neighbor pixel art and no external asset dependencies.
- Define a fixed atlas layout in code so tile lookup is deterministic and simple.

### Block definitions and face mapping

- Extend block metadata so blocks specify atlas tile usage by face rather than only a flat color.
- Support different tiles for top, bottom, and side faces.
- Use these defaults:
  - grass: grass top on top, dirt on bottom, grass side on sides
  - dirt: dirt on all faces
  - stone: stone on all faces
- Keep air non-solid and textureless.

### Mesh generation and UV data

- Update chunk meshing to emit UV coordinates per vertex for every visible face.
- Add face-aware UV selection so the mesher chooses the correct atlas tile for each emitted face.
- Preserve the current face shading values, but store them separately from texture data.
- Apply a small UV inset to avoid atlas bleeding between adjacent tiles.

### Rendering and shader pipeline

- Update the voxel shader pair to sample from a bound atlas texture instead of using vertex color as final output.
- Keep directional shading by multiplying sampled texture color by the per-face shade factor.
- Update the voxel mesh vertex format from:
  - position + color
    to:
  - position + uv + shade
- Update VAO/VBO attribute setup accordingly.

### Native GL bridge support

- Extend the native bridge and TS wrapper with the minimum texture APIs needed for the atlas path:
  - texture creation/deletion
  - bind/active texture
  - 2D texture upload
  - texture parameter setup
  - integer sampler uniform binding
- Add the necessary GL constants for 2D textures, texture unit 0, clamp-to-edge, and nearest filtering.

### Atlas loading and renderer bootstrap

- Add a lightweight atlas loading path that fits the current repo structure and does not require pulling in a full image-processing dependency unless necessary.
- Load the atlas once during voxel renderer initialization.
- Upload the atlas as an RGBA texture with nearest filtering and clamp-to-edge wrapping.
- Bind the atlas for voxel terrain rendering only; text/UI/highlight rendering remains unchanged.

## Important public interfaces/types

- `BlockDefinition` gains per-face atlas tile metadata.
- `MeshData.vertexData` layout changes to include UV and shade data for voxel meshes.
- The voxel renderer gains atlas texture initialization and binding behavior.
- The native bridge GL surface gains texture-related methods and constants.

## Test Plan

- Mesher tests:
  - grass top, side, and bottom faces use the correct atlas tile
  - dirt and stone use the same tile on all faces
  - UVs stay within the expected tile bounds and include the inset
- Renderer/bridge tests:
  - TypeScript compiles with the expanded GL bridge API
  - native bridge still builds successfully
  - shader compile/link succeeds with the new texture uniforms and attributes
- Asset/loading tests:
  - atlas loader returns the expected dimensions and byte payload
  - atlas tile mapping matches the intended layout
- Manual validation:
  - grass, dirt, and stone are visually distinct in-game
  - textures remain crisp up close
  - no obvious texture bleeding appears at block edges or chunk seams

## Assumptions And Defaults

- Use one shared atlas for all current terrain blocks.
- Keep voxel rendering opaque-only in this pass; transparency, mipmaps, and animated textures are out of scope.
- Preserve the current directional face shading model and apply it on top of sampled texture color.
- Use the next plan filename in sequence: `0003-textured-voxel-atlas.md`.
