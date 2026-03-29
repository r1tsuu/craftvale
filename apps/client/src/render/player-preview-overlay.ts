import {
  type BlockId,
  createLookAtMat4,
  createPerspectiveMat4,
  type MeshData,
  multiplyMat4,
} from '@craftvale/core/shared'

import type { NativeBridge } from '../platform/native.ts'
import type { UiPlayerPreview } from '../ui/components.ts'

import { GL, loadTextAsset } from '../platform/native.ts'
import { loadVoxelAtlasImageData } from '../world/atlas.ts'
import { buildItemBlockMesh } from './item-mesh.ts'
import { PlayerRenderer } from './player-renderer.ts'

interface GpuMesh {
  vao: number
  vbo: number
  ebo: number
  indexCount: number
}

const PREVIEW_CAMERA_VIEW = createLookAtMat4(
  { x: 0, y: 1.08, z: 3.55 },
  { x: 0, y: 1.0, z: 0 },
  { x: 0, y: 1, z: 0 },
)

const compileShader = (nativeBridge: NativeBridge, type: number, source: string): number => {
  const shader = nativeBridge.gl.createShader(type)
  nativeBridge.gl.shaderSource(shader, source)
  if (!nativeBridge.gl.compileShader(shader)) {
    const log = nativeBridge.gl.getShaderInfoLog(shader)
    nativeBridge.gl.deleteShader(shader)
    throw new Error(`Player preview shader compilation failed:\n${log}`)
  }
  return shader
}

export class PlayerPreviewOverlayRenderer {
  private readonly program: number
  private readonly viewProjectionLocation: number
  private readonly modelLocation: number
  private readonly atlasSamplerLocation: number
  private readonly daylightLocation: number
  private readonly forceSkyLightLocation: number
  private readonly forceBlockLightLocation: number
  private readonly atlasTexture: number
  private readonly blockMeshes = new Map<number, GpuMesh | null>()
  private readonly playerRenderer: PlayerRenderer

  public constructor(private readonly nativeBridge: NativeBridge) {
    const vertexShader = compileShader(
      nativeBridge,
      GL.VERTEX_SHADER,
      loadTextAsset('assets/shaders/voxel.vert'),
    )
    const fragmentShader = compileShader(
      nativeBridge,
      GL.FRAGMENT_SHADER,
      loadTextAsset('assets/shaders/voxel.frag'),
    )

    this.program = nativeBridge.gl.createProgram()
    nativeBridge.gl.attachShader(this.program, vertexShader)
    nativeBridge.gl.attachShader(this.program, fragmentShader)
    if (!nativeBridge.gl.linkProgram(this.program)) {
      const log = nativeBridge.gl.getProgramInfoLog(this.program)
      throw new Error(`Player preview program link failed:\n${log}`)
    }

    nativeBridge.gl.deleteShader(vertexShader)
    nativeBridge.gl.deleteShader(fragmentShader)

    this.viewProjectionLocation = nativeBridge.gl.getUniformLocation(
      this.program,
      'uViewProjection',
    )
    this.modelLocation = nativeBridge.gl.getUniformLocation(this.program, 'uModel')
    this.atlasSamplerLocation = nativeBridge.gl.getUniformLocation(this.program, 'uAtlas')
    this.daylightLocation = nativeBridge.gl.getUniformLocation(this.program, 'uDaylight')
    this.forceSkyLightLocation = nativeBridge.gl.getUniformLocation(this.program, 'uForceSkyLight')
    this.forceBlockLightLocation = nativeBridge.gl.getUniformLocation(
      this.program,
      'uForceBlockLight',
    )
    this.atlasTexture = this.createAtlasTexture()
    this.playerRenderer = new PlayerRenderer(
      (matrix) => {
        this.nativeBridge.gl.uniformMatrix4fv(this.modelLocation, matrix)
      },
      (skyLight, blockLight) => {
        this.nativeBridge.gl.uniform1f(this.forceSkyLightLocation, skyLight)
        this.nativeBridge.gl.uniform1f(this.forceBlockLightLocation, blockLight)
      },
      (blockId) => this.getBlockMesh(blockId),
      (mesh) => {
        this.nativeBridge.gl.bindVertexArray(mesh.vao)
        this.nativeBridge.gl.drawElements(GL.TRIANGLES, mesh.indexCount, GL.UNSIGNED_INT, 0)
      },
    )
  }

  public render(
    previews: readonly UiPlayerPreview[],
    windowWidth: number,
    windowHeight: number,
    framebufferWidth: number,
    framebufferHeight: number,
  ): void {
    if (previews.length === 0) {
      return
    }

    this.nativeBridge.gl.clear(GL.DEPTH_BUFFER_BIT)
    this.nativeBridge.gl.enable(GL.DEPTH_TEST)
    this.nativeBridge.gl.enable(GL.CULL_FACE)
    this.nativeBridge.gl.disable(GL.BLEND)
    this.nativeBridge.gl.useProgram(this.program)
    this.nativeBridge.gl.activeTexture(GL.TEXTURE0)
    this.nativeBridge.gl.bindTexture(GL.TEXTURE_2D, this.atlasTexture)
    this.nativeBridge.gl.uniform1i(this.atlasSamplerLocation, 0)
    this.nativeBridge.gl.uniform1f(this.daylightLocation, 1)
    this.nativeBridge.gl.uniform1f(this.forceSkyLightLocation, 15)
    this.nativeBridge.gl.uniform1f(this.forceBlockLightLocation, 0)

    for (const preview of previews) {
      const viewportWidth = Math.max(
        1,
        Math.round((preview.rect.width * framebufferWidth) / windowWidth),
      )
      const viewportHeight = Math.max(
        1,
        Math.round((preview.rect.height * framebufferHeight) / windowHeight),
      )
      const viewportX = Math.round((preview.rect.x * framebufferWidth) / windowWidth)
      const viewportY = Math.round(
        ((windowHeight - (preview.rect.y + preview.rect.height)) * framebufferHeight) /
          windowHeight,
      )
      const viewProjection = multiplyMat4(
        createPerspectiveMat4(Math.PI / 5.2, viewportWidth / viewportHeight, 0.1, 16),
        PREVIEW_CAMERA_VIEW,
      )

      this.nativeBridge.gl.viewport(viewportX, viewportY, viewportWidth, viewportHeight)
      this.nativeBridge.gl.uniformMatrix4fv(this.viewProjectionLocation, viewProjection)
      this.playerRenderer.renderInventoryPreview(preview.yaw, preview.pitch)
    }

    this.nativeBridge.gl.bindVertexArray(0)
    this.nativeBridge.gl.bindTexture(GL.TEXTURE_2D, 0)
    this.nativeBridge.gl.viewport(0, 0, framebufferWidth, framebufferHeight)
    this.nativeBridge.gl.disable(GL.DEPTH_TEST)
    this.nativeBridge.gl.uniform1f(this.forceSkyLightLocation, -1)
    this.nativeBridge.gl.uniform1f(this.forceBlockLightLocation, -1)
  }

  private getBlockMesh(blockId: BlockId): GpuMesh | null {
    if (this.blockMeshes.has(blockId)) {
      return this.blockMeshes.get(blockId) ?? null
    }

    const mesh = this.createGpuMesh(buildItemBlockMesh(blockId))
    this.blockMeshes.set(blockId, mesh)
    return mesh
  }

  private createGpuMesh(mesh: MeshData): GpuMesh | null {
    if (mesh.indexCount === 0) {
      return null
    }

    const vao = this.nativeBridge.gl.genVertexArray()
    const vbo = this.nativeBridge.gl.genBuffer()
    const ebo = this.nativeBridge.gl.genBuffer()

    this.nativeBridge.gl.bindVertexArray(vao)
    this.nativeBridge.gl.bindBuffer(GL.ARRAY_BUFFER, vbo)
    this.nativeBridge.gl.bufferData(GL.ARRAY_BUFFER, mesh.vertexData, GL.STATIC_DRAW)
    this.nativeBridge.gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, ebo)
    this.nativeBridge.gl.bufferData(GL.ELEMENT_ARRAY_BUFFER, mesh.indexData, GL.STATIC_DRAW)

    const stride = 8 * Float32Array.BYTES_PER_ELEMENT
    this.nativeBridge.gl.enableVertexAttribArray(0)
    this.nativeBridge.gl.vertexAttribPointer(0, 3, GL.FLOAT, false, stride, 0)
    this.nativeBridge.gl.enableVertexAttribArray(1)
    this.nativeBridge.gl.vertexAttribPointer(
      1,
      2,
      GL.FLOAT,
      false,
      stride,
      3 * Float32Array.BYTES_PER_ELEMENT,
    )
    this.nativeBridge.gl.enableVertexAttribArray(2)
    this.nativeBridge.gl.vertexAttribPointer(
      2,
      1,
      GL.FLOAT,
      false,
      stride,
      5 * Float32Array.BYTES_PER_ELEMENT,
    )
    this.nativeBridge.gl.enableVertexAttribArray(3)
    this.nativeBridge.gl.vertexAttribPointer(
      3,
      1,
      GL.FLOAT,
      false,
      stride,
      6 * Float32Array.BYTES_PER_ELEMENT,
    )
    this.nativeBridge.gl.enableVertexAttribArray(4)
    this.nativeBridge.gl.vertexAttribPointer(
      4,
      1,
      GL.FLOAT,
      false,
      stride,
      7 * Float32Array.BYTES_PER_ELEMENT,
    )

    return {
      vao,
      vbo,
      ebo,
      indexCount: mesh.indexCount,
    }
  }

  private createAtlasTexture(): number {
    const atlas = loadVoxelAtlasImageData()
    const texture = this.nativeBridge.gl.genTexture()
    this.nativeBridge.gl.activeTexture(GL.TEXTURE0)
    this.nativeBridge.gl.bindTexture(GL.TEXTURE_2D, texture)
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
    )
    this.nativeBridge.gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST)
    this.nativeBridge.gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST)
    this.nativeBridge.gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE)
    this.nativeBridge.gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE)
    this.nativeBridge.gl.bindTexture(GL.TEXTURE_2D, 0)
    return texture
  }
}
