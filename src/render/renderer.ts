import type { Vec3 } from "../math/vec3.ts";
import type { ChunkCoord } from "../types.ts";
import { ACTIVE_CHUNK_RADIUS, CHUNK_SIZE } from "../world/constants.ts";
import { buildChunkMesh } from "../world/mesher.ts";
import { VoxelWorld } from "../world/world.ts";
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
  private readonly meshes = new Map<string, GpuMesh>();
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
    this.focusHighlightRenderer = new FocusHighlightRenderer(nativeBridge);
    this.textOverlayRenderer = new TextOverlayRenderer(nativeBridge);
    this.uiRenderer = new UiRenderer(nativeBridge);
  }

  public render(
    world: VoxelWorld,
    player: PlayerController,
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

    const aspect = Math.max(width / Math.max(height, 1), 0.01);
    const viewProjection = player.getViewProjection(aspect);
    this.nativeBridge.gl.uniformMatrix4fv(this.viewProjectionLocation, viewProjection);

    const playerChunkX = Math.floor(player.state.position[0] / CHUNK_SIZE);
    const playerChunkZ = Math.floor(player.state.position[2] / CHUNK_SIZE);
    world.ensureActiveArea(playerChunkX, playerChunkZ, ACTIVE_CHUNK_RADIUS);

    for (const coord of world.getLoadedChunkCoords()) {
      if (
        Math.abs(coord.x - playerChunkX) > ACTIVE_CHUNK_RADIUS ||
        Math.abs(coord.z - playerChunkZ) > ACTIVE_CHUNK_RADIUS
      ) {
        continue;
      }

      this.syncChunkMesh(world, coord);
      const gpuMesh = this.meshes.get(meshKey(coord));
      if (!gpuMesh || gpuMesh.indexCount === 0) {
        continue;
      }

      this.nativeBridge.gl.bindVertexArray(gpuMesh.vao);
      this.nativeBridge.gl.drawElements(GL.TRIANGLES, gpuMesh.indexCount, GL.UNSIGNED_INT, 0);
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
      this.nativeBridge.gl.deleteBuffer(existing.vbo);
      this.nativeBridge.gl.deleteBuffer(existing.ebo);
      this.nativeBridge.gl.deleteVertexArray(existing.vao);
      this.meshes.delete(key);
    }

    const mesh = buildChunkMesh(world, coord);
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
      3,
      GL.FLOAT,
      false,
      stride,
      3 * Float32Array.BYTES_PER_ELEMENT,
    );

    this.meshes.set(key, {
      vao,
      vbo,
      ebo,
      indexCount: mesh.indexCount,
    });
  }
}
