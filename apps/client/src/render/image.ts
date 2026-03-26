import { createOrthographicMat4 } from "@craftvale/core/shared";
import { GL, NativeBridge, loadTextAsset } from "../platform/native.ts";
import { loadItemIconAtlasImageData } from "../world/item-icons.ts";

export interface ImageDrawCommand {
  x: number;
  y: number;
  width: number;
  height: number;
  uvRect: {
    uMin: number;
    uMax: number;
    vMin: number;
    vMax: number;
  };
  color?: readonly [number, number, number, number?];
}

const compileShader = (nativeBridge: NativeBridge, type: number, source: string): number => {
  const shader = nativeBridge.gl.createShader(type);
  nativeBridge.gl.shaderSource(shader, source);
  if (!nativeBridge.gl.compileShader(shader)) {
    const log = nativeBridge.gl.getShaderInfoLog(shader);
    nativeBridge.gl.deleteShader(shader);
    throw new Error(`Image shader compilation failed:\n${log}`);
  }
  return shader;
};

const pushImage = (
  vertices: number[],
  indices: number[],
  baseIndex: number,
  image: ImageDrawCommand,
): void => {
  const { x, y, width, height, uvRect } = image;
  const [red, green, blue, alpha = 1] = image.color ?? [1, 1, 1, 1];

  vertices.push(
    x, y, uvRect.uMin, uvRect.vMin, red, green, blue, alpha,
    x + width, y, uvRect.uMax, uvRect.vMin, red, green, blue, alpha,
    x + width, y + height, uvRect.uMax, uvRect.vMax, red, green, blue, alpha,
    x, y + height, uvRect.uMin, uvRect.vMax, red, green, blue, alpha,
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

export class ImageOverlayRenderer {
  private readonly program: number;
  private readonly projectionLocation: number;
  private readonly textureLocation: number;
  private readonly vao: number;
  private readonly vbo: number;
  private readonly ebo: number;
  private readonly texture: number;

  public constructor(private readonly nativeBridge: NativeBridge) {
    const vertexShader = compileShader(
      nativeBridge,
      GL.VERTEX_SHADER,
      loadTextAsset("assets/shaders/ui-image.vert"),
    );
    const fragmentShader = compileShader(
      nativeBridge,
      GL.FRAGMENT_SHADER,
      loadTextAsset("assets/shaders/ui-image.frag"),
    );

    this.program = nativeBridge.gl.createProgram();
    nativeBridge.gl.attachShader(this.program, vertexShader);
    nativeBridge.gl.attachShader(this.program, fragmentShader);
    if (!nativeBridge.gl.linkProgram(this.program)) {
      const log = nativeBridge.gl.getProgramInfoLog(this.program);
      throw new Error(`Image program link failed:\n${log}`);
    }

    nativeBridge.gl.deleteShader(vertexShader);
    nativeBridge.gl.deleteShader(fragmentShader);

    this.projectionLocation = nativeBridge.gl.getUniformLocation(this.program, "uProjection");
    this.textureLocation = nativeBridge.gl.getUniformLocation(this.program, "uTexture");
    this.vao = nativeBridge.gl.genVertexArray();
    this.vbo = nativeBridge.gl.genBuffer();
    this.ebo = nativeBridge.gl.genBuffer();

    nativeBridge.gl.bindVertexArray(this.vao);
    nativeBridge.gl.bindBuffer(GL.ARRAY_BUFFER, this.vbo);
    nativeBridge.gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, this.ebo);

    const stride = 8 * Float32Array.BYTES_PER_ELEMENT;
    nativeBridge.gl.enableVertexAttribArray(0);
    nativeBridge.gl.vertexAttribPointer(0, 2, GL.FLOAT, false, stride, 0);
    nativeBridge.gl.enableVertexAttribArray(1);
    nativeBridge.gl.vertexAttribPointer(
      1,
      2,
      GL.FLOAT,
      false,
      stride,
      2 * Float32Array.BYTES_PER_ELEMENT,
    );
    nativeBridge.gl.enableVertexAttribArray(2);
    nativeBridge.gl.vertexAttribPointer(
      2,
      4,
      GL.FLOAT,
      false,
      stride,
      4 * Float32Array.BYTES_PER_ELEMENT,
    );

    const atlas = loadItemIconAtlasImageData();
    this.texture = nativeBridge.gl.genTexture();
    nativeBridge.gl.activeTexture(GL.TEXTURE0);
    nativeBridge.gl.bindTexture(GL.TEXTURE_2D, this.texture);
    nativeBridge.gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);
    nativeBridge.gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
    nativeBridge.gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_S, GL.CLAMP_TO_EDGE);
    nativeBridge.gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_WRAP_T, GL.CLAMP_TO_EDGE);
    nativeBridge.gl.texImage2D(
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
    nativeBridge.gl.bindTexture(GL.TEXTURE_2D, 0);
    nativeBridge.gl.bindVertexArray(0);
  }

  public render(images: readonly ImageDrawCommand[], width: number, height: number): void {
    if (images.length === 0) {
      return;
    }

    const vertices: number[] = [];
    const indices: number[] = [];
    let baseIndex = 0;

    for (const image of images) {
      pushImage(vertices, indices, baseIndex, image);
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
    this.nativeBridge.gl.uniform1i(this.textureLocation, 0);
    this.nativeBridge.gl.activeTexture(GL.TEXTURE0);
    this.nativeBridge.gl.bindTexture(GL.TEXTURE_2D, this.texture);
    this.nativeBridge.gl.bindVertexArray(this.vao);
    this.nativeBridge.gl.bindBuffer(GL.ARRAY_BUFFER, this.vbo);
    this.nativeBridge.gl.bufferData(GL.ARRAY_BUFFER, vertexData, GL.DYNAMIC_DRAW);
    this.nativeBridge.gl.bindBuffer(GL.ELEMENT_ARRAY_BUFFER, this.ebo);
    this.nativeBridge.gl.bufferData(GL.ELEMENT_ARRAY_BUFFER, indexData, GL.DYNAMIC_DRAW);
    this.nativeBridge.gl.drawElements(GL.TRIANGLES, indexData.length, GL.UNSIGNED_INT, 0);
    this.nativeBridge.gl.bindVertexArray(0);
    this.nativeBridge.gl.bindTexture(GL.TEXTURE_2D, 0);
    this.nativeBridge.gl.disable(GL.BLEND);
    this.nativeBridge.gl.enable(GL.CULL_FACE);
    this.nativeBridge.gl.enable(GL.DEPTH_TEST);
  }
}
