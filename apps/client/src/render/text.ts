import { createOrthographicMat4 } from "@voxel/core/shared";
import { GL, NativeBridge, loadTextAsset } from "../platform/native.ts";
import { buildTextMesh } from "./text-mesh.ts";

export interface TextDrawCommand {
  text: string;
  x: number;
  y: number;
  scale: number;
  color: readonly [number, number, number, number?];
  shadowColor?: readonly [number, number, number, number?];
  shadowOffset?: { x: number; y: number };
}

const compileShader = (nativeBridge: NativeBridge, type: number, source: string): number => {
  const shader = nativeBridge.gl.createShader(type);
  nativeBridge.gl.shaderSource(shader, source);
  if (!nativeBridge.gl.compileShader(shader)) {
    const log = nativeBridge.gl.getShaderInfoLog(shader);
    nativeBridge.gl.deleteShader(shader);
    throw new Error(`Text shader compilation failed:\n${log}`);
  }
  return shader;
};

export class TextOverlayRenderer {
  private readonly program: number;
  private readonly projectionLocation: number;
  private readonly vao: number;
  private readonly vbo: number;
  private readonly ebo: number;

  public constructor(private readonly nativeBridge: NativeBridge) {
    const vertexShader = compileShader(
      nativeBridge,
      GL.VERTEX_SHADER,
      loadTextAsset("assets/shaders/text.vert"),
    );
    const fragmentShader = compileShader(
      nativeBridge,
      GL.FRAGMENT_SHADER,
      loadTextAsset("assets/shaders/text.frag"),
    );

    this.program = nativeBridge.gl.createProgram();
    nativeBridge.gl.attachShader(this.program, vertexShader);
    nativeBridge.gl.attachShader(this.program, fragmentShader);

    if (!nativeBridge.gl.linkProgram(this.program)) {
      const log = nativeBridge.gl.getProgramInfoLog(this.program);
      throw new Error(`Text program link failed:\n${log}`);
    }

    nativeBridge.gl.deleteShader(vertexShader);
    nativeBridge.gl.deleteShader(fragmentShader);

    this.projectionLocation = nativeBridge.gl.getUniformLocation(this.program, "uProjection");
    this.vao = nativeBridge.gl.genVertexArray();
    this.vbo = nativeBridge.gl.genBuffer();
    this.ebo = nativeBridge.gl.genBuffer();

    nativeBridge.gl.bindVertexArray(this.vao);
    nativeBridge.gl.bindBuffer(GL.ARRAY_BUFFER, this.vbo);
    nativeBridge.gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, this.ebo);

    const stride = 6 * Float32Array.BYTES_PER_ELEMENT;
    nativeBridge.gl.enableVertexAttribArray(0);
    nativeBridge.gl.vertexAttribPointer(0, 2, GL.FLOAT, false, stride, 0);
    nativeBridge.gl.enableVertexAttribArray(1);
    nativeBridge.gl.vertexAttribPointer(
      1,
      4,
      GL.FLOAT,
      false,
      stride,
      2 * Float32Array.BYTES_PER_ELEMENT,
    );
  }

  public render(commands: readonly TextDrawCommand[], width: number, height: number): void {
    const vertices: number[] = [];
    const indices: number[] = [];
    let baseIndex = 0;

    for (const command of commands) {
      if (command.shadowColor) {
        const offset = command.shadowOffset ?? { x: 1, y: 1 };
        const shadow = buildTextMesh(
          command.text,
          command.x + offset.x,
          command.y + offset.y,
          command.scale,
          command.shadowColor,
        );

        vertices.push(...shadow.vertexData);
        indices.push(...shadow.indexData.map((index) => index + baseIndex));
        baseIndex += shadow.vertexData.length / 6;
      }

      const text = buildTextMesh(
        command.text,
        command.x,
        command.y,
        command.scale,
        command.color,
      );

      vertices.push(...text.vertexData);
      indices.push(...text.indexData.map((index) => index + baseIndex));
      baseIndex += text.vertexData.length / 6;
    }

    if (indices.length === 0) {
      return;
    }

    const vertexData = new Float32Array(vertices);
    const indexData = new Uint32Array(indices);
    const projection = createOrthographicMat4(0, width, height, 0, -1, 1);

    this.nativeBridge.gl.disable(GL.DEPTH_TEST);
    this.nativeBridge.gl.disable(GL.CULL_FACE);
    this.nativeBridge.gl.enable(GL.BLEND);
    this.nativeBridge.gl.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
    this.nativeBridge.gl.useProgram(this.program);
    this.nativeBridge.gl.uniformMatrix4fv(this.projectionLocation, projection);
    this.nativeBridge.gl.bindVertexArray(this.vao);
    this.nativeBridge.gl.bindBuffer(GL.ARRAY_BUFFER, this.vbo);
    this.nativeBridge.gl.bufferData(GL.ARRAY_BUFFER, vertexData, GL.DYNAMIC_DRAW);
    this.nativeBridge.gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, this.ebo);
    this.nativeBridge.gl.bufferData(GL.ELEMENT_ARRAY_BUFFER, indexData, GL.DYNAMIC_DRAW);
    this.nativeBridge.gl.drawElements(GL.TRIANGLES, indexData.length, GL.UNSIGNED_INT, 0);
    this.nativeBridge.gl.bindVertexArray(0);
    this.nativeBridge.gl.disable(GL.BLEND);
    this.nativeBridge.gl.enable(GL.CULL_FACE);
    this.nativeBridge.gl.enable(GL.DEPTH_TEST);
  }
}
