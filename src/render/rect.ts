import { createOrthographicMat4 } from "../math/mat4.ts";
import { GL, NativeBridge, loadTextAsset } from "../platform/native.ts";

export interface RectDrawCommand {
  x: number;
  y: number;
  width: number;
  height: number;
  color: readonly [number, number, number, number?];
}

const compileShader = (nativeBridge: NativeBridge, type: number, source: string): number => {
  const shader = nativeBridge.gl.createShader(type);
  nativeBridge.gl.shaderSource(shader, source);
  if (!nativeBridge.gl.compileShader(shader)) {
    const log = nativeBridge.gl.getShaderInfoLog(shader);
    nativeBridge.gl.deleteShader(shader);
    throw new Error(`Rectangle shader compilation failed:\n${log}`);
  }
  return shader;
};

const pushRect = (
  vertices: number[],
  indices: number[],
  baseIndex: number,
  rect: RectDrawCommand,
): void => {
  const { x, y, width, height, color } = rect;
  const [red, green, blue, alpha = 1] = color;

  vertices.push(
    x, y, red, green, blue, alpha,
    x + width, y, red, green, blue, alpha,
    x + width, y + height, red, green, blue, alpha,
    x, y + height, red, green, blue, alpha,
  );

  indices.push(
    baseIndex,
    baseIndex + 1,
    baseIndex + 2,
    baseIndex,
    baseIndex + 2,
    baseIndex + 3,
  );
};

export class RectOverlayRenderer {
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
      throw new Error(`Rectangle program link failed:\n${log}`);
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

  public render(rects: readonly RectDrawCommand[], width: number, height: number): void {
    if (rects.length === 0) {
      return;
    }

    const vertices: number[] = [];
    const indices: number[] = [];
    let baseIndex = 0;

    for (const rect of rects) {
      pushRect(vertices, indices, baseIndex, rect);
      baseIndex += 4;
    }

    const projection = createOrthographicMat4(0, width, height, 0, -1, 1);
    const vertexData = new Float32Array(vertices);
    const indexData = new Uint32Array(indices);

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
