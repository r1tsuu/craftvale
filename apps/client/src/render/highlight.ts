import type { Vec3 } from '@craftvale/core/shared'

import type { NativeBridge } from '../platform/native.ts'

import { GL, loadTextAsset } from '../platform/native.ts'
import { buildFocusHighlightMesh } from './highlight-mesh.ts'

const compileShader = (nativeBridge: NativeBridge, type: number, source: string): number => {
  const shader = nativeBridge.gl.createShader(type)
  nativeBridge.gl.shaderSource(shader, source)
  if (!nativeBridge.gl.compileShader(shader)) {
    const log = nativeBridge.gl.getShaderInfoLog(shader)
    nativeBridge.gl.deleteShader(shader)
    throw new Error(`Highlight shader compilation failed:\n${log}`)
  }
  return shader
}

export class FocusHighlightRenderer {
  private readonly program: number
  private readonly viewProjectionLocation: number
  private readonly vao: number
  private readonly vbo: number
  private readonly ebo: number

  public constructor(private readonly nativeBridge: NativeBridge) {
    const vertexShader = compileShader(
      nativeBridge,
      GL.VERTEX_SHADER,
      loadTextAsset('assets/shaders/highlight.vert'),
    )
    const fragmentShader = compileShader(
      nativeBridge,
      GL.FRAGMENT_SHADER,
      loadTextAsset('assets/shaders/highlight.frag'),
    )

    this.program = nativeBridge.gl.createProgram()
    nativeBridge.gl.attachShader(this.program, vertexShader)
    nativeBridge.gl.attachShader(this.program, fragmentShader)

    if (!nativeBridge.gl.linkProgram(this.program)) {
      const log = nativeBridge.gl.getProgramInfoLog(this.program)
      throw new Error(`Highlight program link failed:\n${log}`)
    }

    nativeBridge.gl.deleteShader(vertexShader)
    nativeBridge.gl.deleteShader(fragmentShader)

    this.viewProjectionLocation = nativeBridge.gl.getUniformLocation(
      this.program,
      'uViewProjection',
    )
    this.vao = nativeBridge.gl.genVertexArray()
    this.vbo = nativeBridge.gl.genBuffer()
    this.ebo = nativeBridge.gl.genBuffer()

    nativeBridge.gl.bindVertexArray(this.vao)
    nativeBridge.gl.bindBuffer(GL.ARRAY_BUFFER, this.vbo)
    nativeBridge.gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, this.ebo)

    const stride = 6 * Float32Array.BYTES_PER_ELEMENT
    nativeBridge.gl.enableVertexAttribArray(0)
    nativeBridge.gl.vertexAttribPointer(0, 3, GL.FLOAT, false, stride, 0)
    nativeBridge.gl.enableVertexAttribArray(1)
    nativeBridge.gl.vertexAttribPointer(
      1,
      3,
      GL.FLOAT,
      false,
      stride,
      3 * Float32Array.BYTES_PER_ELEMENT,
    )

    nativeBridge.gl.bindVertexArray(0)
  }

  public render(block: Vec3 | null, viewProjection: Float32Array): void {
    if (!block) {
      return
    }

    const mesh = buildFocusHighlightMesh(block)

    this.nativeBridge.gl.disable(GL.CULL_FACE)
    this.nativeBridge.gl.useProgram(this.program)
    this.nativeBridge.gl.uniformMatrix4fv(this.viewProjectionLocation, viewProjection)
    this.nativeBridge.gl.bindVertexArray(this.vao)
    this.nativeBridge.gl.bindBuffer(GL.ARRAY_BUFFER, this.vbo)
    this.nativeBridge.gl.bufferData(GL.ARRAY_BUFFER, mesh.vertexData, GL.DYNAMIC_DRAW)
    this.nativeBridge.gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, this.ebo)
    this.nativeBridge.gl.bufferData(GL.ELEMENT_ARRAY_BUFFER, mesh.indexData, GL.DYNAMIC_DRAW)
    this.nativeBridge.gl.drawElements(GL.LINES, mesh.indexData.length, GL.UNSIGNED_INT, 0)
    this.nativeBridge.gl.bindVertexArray(0)
    this.nativeBridge.gl.enable(GL.CULL_FACE)
  }
}
