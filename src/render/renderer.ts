import type { Vec3 } from "../math/vec3.ts";
import type { ChunkCoord, MeshData } from "../types.ts";
import { CHUNK_SIZE } from "../world/constants.ts";
import { buildChunkMesh } from "../world/mesher.ts";
import { VoxelWorld } from "../world/world.ts";
import { loadVoxelAtlasImageData } from "../world/atlas.ts";
import { PlayerController } from "../game/player.ts";
import { GL, NativeBridge, loadTextAsset } from "../platform/native.ts";
import { FocusHighlightRenderer } from "./highlight.ts";
import { TextOverlayRenderer, type TextDrawCommand } from "./text.ts";
import { UiRenderer } from "../ui/renderer.ts";
import type { UiResolvedComponent } from "../ui/components.ts";

interface GpuMesh {
  vao: number;
  vbo: number;
  ebo: number;
  indexCount: number;
}

interface GpuChunkMesh {
  opaque: GpuMesh | null;
  cutout: GpuMesh | null;
}

const meshKey = ({ x, y, z }: ChunkCoord): string => `${x},${y},${z}`;

const compileShader = (nativeBridge: NativeBridge, type: number, source: string): number => {
  const shader = nativeBridge.gl.createShader(type);
  nativeBridge.gl.shaderSource(shader, source);
  if (!nativeBridge.gl.compileShader(shader)) {
    const log = nativeBridge.gl.getShaderInfoLog(shader);
    nativeBridge.gl.deleteShader(shader);
    throw new Error(`Shader compilation failed:\n${log}`);
  }
  return shader;
};

export class VoxelRenderer {
  private readonly program: number;
  private readonly viewProjectionLocation: number;
  private readonly atlasSamplerLocation: number;
  private readonly atlasTexture: number;
  private readonly meshes = new Map<string, GpuChunkMesh>();
  private readonly focusHighlightRenderer: FocusHighlightRenderer;
  private readonly textOverlayRenderer: TextOverlayRenderer;
  private readonly uiRenderer: UiRenderer;

  public constructor(private readonly nativeBridge: NativeBridge) {
    this.nativeBridge.gl.enable(GL.DEPTH_TEST);
    this.nativeBridge.gl.enable(GL.CULL_FACE);
    this.nativeBridge.gl.cullFace(GL.BACK);
    this.nativeBridge.gl.depthFunc(GL.LESS);

    const vertexShader = compileShader(
      nativeBridge,
      GL.VERTEX_SHADER,
      loadTextAsset("assets/shaders/voxel.vert"),
    );
    const fragmentShader = compileShader(
      nativeBridge,
      GL.FRAGMENT_SHADER,
      loadTextAsset("assets/shaders/voxel.frag"),
    );

    this.program = nativeBridge.gl.createProgram();
    nativeBridge.gl.attachShader(this.program, vertexShader);
    nativeBridge.gl.attachShader(this.program, fragmentShader);

    if (!nativeBridge.gl.linkProgram(this.program)) {
      const log = nativeBridge.gl.getProgramInfoLog(this.program);
      throw new Error(`Program link failed:\n${log}`);
    }

    nativeBridge.gl.deleteShader(vertexShader);
    nativeBridge.gl.deleteShader(fragmentShader);

    this.viewProjectionLocation = nativeBridge.gl.getUniformLocation(
      this.program,
      "uViewProjection",
    );
    this.atlasSamplerLocation = nativeBridge.gl.getUniformLocation(this.program, "uAtlas");
    this.atlasTexture = this.createAtlasTexture();
    this.focusHighlightRenderer = new FocusHighlightRenderer(nativeBridge);
    this.textOverlayRenderer = new TextOverlayRenderer(nativeBridge);
    this.uiRenderer = new UiRenderer(nativeBridge);
  }

  public render(
    world: VoxelWorld,
    player: PlayerController,
    renderDistance: number,
    width: number,
    height: number,
    focusedBlock: Vec3 | null,
    overlayText: readonly TextDrawCommand[],
    uiComponents: readonly UiResolvedComponent[],
    uiWidth: number,
    uiHeight: number,
  ): void {
    this.nativeBridge.gl.viewport(0, 0, width, height);
    this.nativeBridge.gl.clearColor(0.56, 0.76, 0.94, 1);
    this.nativeBridge.gl.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
    this.nativeBridge.gl.useProgram(this.program);
    this.nativeBridge.gl.activeTexture(GL.TEXTURE0);
    this.nativeBridge.gl.bindTexture(GL.TEXTURE_2D, this.atlasTexture);
    this.nativeBridge.gl.uniform1i(this.atlasSamplerLocation, 0);

    const aspect = Math.max(width / Math.max(height, 1), 0.01);
    const viewProjection = player.getViewProjection(aspect);
    this.nativeBridge.gl.uniformMatrix4fv(this.viewProjectionLocation, viewProjection);

    const playerChunkX = Math.floor(player.state.position[0] / CHUNK_SIZE);
    const playerChunkZ = Math.floor(player.state.position[2] / CHUNK_SIZE);

    const visibleCoords = world.getLoadedChunkCoords().filter(
      (coord) =>
        Math.abs(coord.x - playerChunkX) <= renderDistance &&
        Math.abs(coord.z - playerChunkZ) <= renderDistance,
    );

    for (const coord of visibleCoords) {
      this.syncChunkMesh(world, coord);
      const gpuMesh = this.meshes.get(meshKey(coord));
      if (!gpuMesh?.opaque) {
        continue;
      }

      this.nativeBridge.gl.bindVertexArray(gpuMesh.opaque.vao);
      this.nativeBridge.gl.drawElements(
        GL.TRIANGLES,
        gpuMesh.opaque.indexCount,
        GL.UNSIGNED_INT,
        0,
      );
    }

    for (const coord of visibleCoords) {
      const gpuMesh = this.meshes.get(meshKey(coord));
      if (!gpuMesh?.cutout) {
        continue;
      }

      this.nativeBridge.gl.bindVertexArray(gpuMesh.cutout.vao);
      this.nativeBridge.gl.drawElements(
        GL.TRIANGLES,
        gpuMesh.cutout.indexCount,
        GL.UNSIGNED_INT,
        0,
      );
    }

    this.nativeBridge.gl.bindVertexArray(0);
    this.focusHighlightRenderer.render(focusedBlock, viewProjection);
    this.textOverlayRenderer.render(overlayText, width, height);
    this.uiRenderer.render(uiComponents, uiWidth, uiHeight);
  }

  private syncChunkMesh(world: VoxelWorld, coord: ChunkCoord): void {
    const chunk = world.getChunk(coord);
    if (!chunk) {
      return;
    }

    const key = meshKey(coord);
    const existing = this.meshes.get(key);
    if (!chunk.dirty && existing) {
      return;
    }

    if (existing) {
      this.deleteGpuChunkMesh(existing);
      this.meshes.delete(key);
    }

    const mesh = buildChunkMesh(world, coord);
    this.meshes.set(key, {
      opaque: this.createGpuMesh(mesh.opaque),
      cutout: this.createGpuMesh(mesh.cutout),
    });
  }

  private createGpuMesh(mesh: MeshData): GpuMesh | null {
    if (mesh.indexCount === 0) {
      return null;
    }

    const vao = this.nativeBridge.gl.genVertexArray();
    const vbo = this.nativeBridge.gl.genBuffer();
    const ebo = this.nativeBridge.gl.genBuffer();

    this.nativeBridge.gl.bindVertexArray(vao);
    this.nativeBridge.gl.bindBuffer(GL.ARRAY_BUFFER, vbo);
    this.nativeBridge.gl.bufferData(GL.ARRAY_BUFFER, mesh.vertexData, GL.STATIC_DRAW);
    this.nativeBridge.gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, ebo);
    this.nativeBridge.gl.bufferData(GL.ELEMENT_ARRAY_BUFFER, mesh.indexData, GL.STATIC_DRAW);

    const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
    this.nativeBridge.gl.enableVertexAttribArray(0);
    this.nativeBridge.gl.vertexAttribPointer(0, 3, GL.FLOAT, false, stride, 0);
    this.nativeBridge.gl.enableVertexAttribArray(1);
    this.nativeBridge.gl.vertexAttribPointer(
      1,
      2,
      GL.FLOAT,
      false,
      stride,
      3 * Float32Array.BYTES_PER_ELEMENT,
    );
    this.nativeBridge.gl.enableVertexAttribArray(2);
    this.nativeBridge.gl.vertexAttribPointer(
      2,
      1,
      GL.FLOAT,
      false,
      stride,
      5 * Float32Array.BYTES_PER_ELEMENT,
    );

    return {
      vao,
      vbo,
      ebo,
      indexCount: mesh.indexCount,
    };
  }

  private deleteGpuChunkMesh(mesh: GpuChunkMesh): void {
    if (mesh.opaque) {
      this.nativeBridge.gl.deleteBuffer(mesh.opaque.vbo);
      this.nativeBridge.gl.deleteBuffer(mesh.opaque.ebo);
      this.nativeBridge.gl.deleteVertexArray(mesh.opaque.vao);
    }

    if (mesh.cutout) {
      this.nativeBridge.gl.deleteBuffer(mesh.cutout.vbo);
      this.nativeBridge.gl.deleteBuffer(mesh.cutout.ebo);
      this.nativeBridge.gl.deleteVertexArray(mesh.cutout.vao);
    }
  }

  private createAtlasTexture(): number {
    const texture = this.nativeBridge.gl.genTexture();
    const atlas = loadVoxelAtlasImageData();

    this.nativeBridge.gl.activeTexture(GL.TEXTURE0);
    this.nativeBridge.gl.bindTexture(GL.TEXTURE_2D, texture);
    this.nativeBridge.gl.texImage2D(
      GL.TEXTURE_2D,
      0,
      GL.RGBA,
      atlas.width,
      atlas.height,
      0,
      GL.RGBA,
      GL.UNSIGNED_BYTE,
      atlas.pixels,
    );
    this.nativeBridge.gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
    this.nativeBridge.gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
    this.nativeBridge.gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
    this.nativeBridge.gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);

    return texture;
  }
}
