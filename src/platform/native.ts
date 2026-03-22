import { dlopen, FFIType, ptr } from "bun:ffi";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { InputState, WindowConfig } from "../types.ts";

const rootDir = import.meta.dir.endsWith("/src/platform")
  ? import.meta.dir.slice(0, -"/src/platform".length)
  : import.meta.dir;
const libraryPath = join(rootDir, "native", "libvoxel_bridge.dylib");

if (!existsSync(libraryPath)) {
  throw new Error(
    `Missing native library at ${libraryPath}. Run "bun run build:native" first.`,
  );
}

const library = dlopen(libraryPath, {
  bridge_init_window: {
    args: [FFIType.i32, FFIType.i32, FFIType.cstring],
    returns: FFIType.i32,
  },
  bridge_shutdown: { args: [], returns: FFIType.void },
  bridge_poll_events: { args: [], returns: FFIType.void },
  bridge_window_should_close: { args: [], returns: FFIType.i32 },
  bridge_request_close: { args: [], returns: FFIType.void },
  bridge_begin_frame: { args: [], returns: FFIType.void },
  bridge_end_frame: { args: [], returns: FFIType.void },
  bridge_get_time: { args: [], returns: FFIType.f64 },
  bridge_set_cursor_disabled: { args: [FFIType.i32], returns: FFIType.void },
  bridge_is_key_down: { args: [FFIType.i32], returns: FFIType.i32 },
  bridge_is_mouse_button_down: { args: [FFIType.i32], returns: FFIType.i32 },
  bridge_get_cursor_x: { args: [], returns: FFIType.f64 },
  bridge_get_cursor_y: { args: [], returns: FFIType.f64 },
  bridge_get_typed_text: { args: [], returns: FFIType.cstring },
  bridge_consume_typed_text: { args: [], returns: FFIType.void },
  bridge_consume_key_press: { args: [FFIType.i32], returns: FFIType.i32 },
  bridge_get_window_width: { args: [], returns: FFIType.i32 },
  bridge_get_window_height: { args: [], returns: FFIType.i32 },
  bridge_get_framebuffer_width: { args: [], returns: FFIType.i32 },
  bridge_get_framebuffer_height: { args: [], returns: FFIType.i32 },
  bridge_was_resized: { args: [], returns: FFIType.i32 },
  bridge_consume_resize: { args: [], returns: FFIType.void },
  bridge_gl_viewport: {
    args: [FFIType.i32, FFIType.i32, FFIType.i32, FFIType.i32],
    returns: FFIType.void,
  },
  bridge_gl_clear_color: {
    args: [FFIType.f32, FFIType.f32, FFIType.f32, FFIType.f32],
    returns: FFIType.void,
  },
  bridge_gl_clear: { args: [FFIType.u32], returns: FFIType.void },
  bridge_gl_enable: { args: [FFIType.u32], returns: FFIType.void },
  bridge_gl_disable: { args: [FFIType.u32], returns: FFIType.void },
  bridge_gl_cull_face: { args: [FFIType.u32], returns: FFIType.void },
  bridge_gl_depth_func: { args: [FFIType.u32], returns: FFIType.void },
  bridge_gl_create_shader: { args: [FFIType.u32], returns: FFIType.u32 },
  bridge_gl_shader_source: {
    args: [FFIType.u32, FFIType.cstring],
    returns: FFIType.void,
  },
  bridge_gl_compile_shader: { args: [FFIType.u32], returns: FFIType.i32 },
  bridge_gl_get_shader_info_log: { args: [FFIType.u32], returns: FFIType.cstring },
  bridge_gl_delete_shader: { args: [FFIType.u32], returns: FFIType.void },
  bridge_gl_create_program: { args: [], returns: FFIType.u32 },
  bridge_gl_attach_shader: { args: [FFIType.u32, FFIType.u32], returns: FFIType.void },
  bridge_gl_link_program: { args: [FFIType.u32], returns: FFIType.i32 },
  bridge_gl_get_program_info_log: { args: [FFIType.u32], returns: FFIType.cstring },
  bridge_gl_use_program: { args: [FFIType.u32], returns: FFIType.void },
  bridge_gl_delete_program: { args: [FFIType.u32], returns: FFIType.void },
  bridge_gl_get_uniform_location: {
    args: [FFIType.u32, FFIType.cstring],
    returns: FFIType.i32,
  },
  bridge_gl_uniform_matrix4fv: {
    args: [FFIType.i32, FFIType.ptr],
    returns: FFIType.void,
  },
  bridge_gl_uniform1i: {
    args: [FFIType.i32, FFIType.i32],
    returns: FFIType.void,
  },
  bridge_gl_gen_vertex_array: { args: [], returns: FFIType.u32 },
  bridge_gl_gen_buffer: { args: [], returns: FFIType.u32 },
  bridge_gl_gen_texture: { args: [], returns: FFIType.u32 },
  bridge_gl_bind_vertex_array: { args: [FFIType.u32], returns: FFIType.void },
  bridge_gl_bind_buffer: { args: [FFIType.u32, FFIType.u32], returns: FFIType.void },
  bridge_gl_active_texture: { args: [FFIType.u32], returns: FFIType.void },
  bridge_gl_bind_texture: { args: [FFIType.u32, FFIType.u32], returns: FFIType.void },
  bridge_gl_buffer_data: {
    args: [FFIType.u32, FFIType.ptr, FFIType.i32, FFIType.u32],
    returns: FFIType.void,
  },
  bridge_gl_tex_image_2d: {
    args: [
      FFIType.u32,
      FFIType.i32,
      FFIType.i32,
      FFIType.i32,
      FFIType.i32,
      FFIType.i32,
      FFIType.u32,
      FFIType.u32,
      FFIType.ptr,
    ],
    returns: FFIType.void,
  },
  bridge_gl_tex_parameteri: {
    args: [FFIType.u32, FFIType.u32, FFIType.i32],
    returns: FFIType.void,
  },
  bridge_gl_enable_vertex_attrib_array: { args: [FFIType.u32], returns: FFIType.void },
  bridge_gl_vertex_attrib_pointer: {
    args: [
      FFIType.u32,
      FFIType.i32,
      FFIType.u32,
      FFIType.i32,
      FFIType.i32,
      FFIType.i32,
    ],
    returns: FFIType.void,
  },
  bridge_gl_draw_elements: {
    args: [FFIType.u32, FFIType.i32, FFIType.u32, FFIType.i32],
    returns: FFIType.void,
  },
  bridge_gl_delete_vertex_array: { args: [FFIType.u32], returns: FFIType.void },
  bridge_gl_delete_buffer: { args: [FFIType.u32], returns: FFIType.void },
  bridge_gl_delete_texture: { args: [FFIType.u32], returns: FFIType.void },
});

const GLFW_KEY_W = 87;
const GLFW_KEY_A = 65;
const GLFW_KEY_S = 83;
const GLFW_KEY_D = 68;
const GLFW_KEY_SPACE = 32;
const GLFW_KEY_LEFT_SHIFT = 340;
const GLFW_KEY_ENTER = 257;
const GLFW_KEY_TAB = 258;
const GLFW_KEY_BACKSPACE = 259;
const GLFW_KEY_ESCAPE = 256;
const GLFW_KEY_1 = 49;
const GLFW_KEY_2 = 50;
const GLFW_KEY_3 = 51;
const GLFW_KEY_4 = 52;
const GLFW_KEY_5 = 53;
const GLFW_MOUSE_BUTTON_LEFT = 0;
const GLFW_MOUSE_BUTTON_RIGHT = 1;

const cstring = (value: string): Uint8Array => new TextEncoder().encode(`${value}\0`);

export const GL = {
  COLOR_BUFFER_BIT: 0x00004000,
  DEPTH_BUFFER_BIT: 0x00000100,
  DEPTH_TEST: 0x0b71,
  CULL_FACE: 0x0b44,
  BACK: 0x0405,
  LESS: 0x0201,
  VERTEX_SHADER: 0x8b31,
  FRAGMENT_SHADER: 0x8b30,
  ARRAY_BUFFER: 0x8892,
  ELEMENT_ARRAY_BUFFER: 0x8893,
  STATIC_DRAW: 0x88e4,
  DYNAMIC_DRAW: 0x88e8,
  FLOAT: 0x1406,
  TRIANGLES: 0x0004,
  LINES: 0x0001,
  UNSIGNED_INT: 0x1405,
  UNSIGNED_BYTE: 0x1401,
  TEXTURE_2D: 0x0de1,
  TEXTURE0: 0x84c0,
  TEXTURE_MIN_FILTER: 0x2801,
  TEXTURE_MAG_FILTER: 0x2800,
  TEXTURE_WRAP_S: 0x2802,
  TEXTURE_WRAP_T: 0x2803,
  CLAMP_TO_EDGE: 0x812f,
  NEAREST: 0x2600,
  RGBA: 0x1908,
} as const;

export class NativeBridge {
  private lastCursorX = 0;
  private lastCursorY = 0;

  public initWindow(config: WindowConfig): void {
    const ok = library.symbols.bridge_init_window(
      config.width,
      config.height,
      cstring(config.title),
    );
    if (!ok) {
      throw new Error("Failed to initialize GLFW window.");
    }

    this.lastCursorX = library.symbols.bridge_get_cursor_x();
    this.lastCursorY = library.symbols.bridge_get_cursor_y();
    library.symbols.bridge_set_cursor_disabled(1);
  }

  public shutdown(): void {
    library.symbols.bridge_shutdown();
  }

  public shouldClose(): boolean {
    return Boolean(library.symbols.bridge_window_should_close());
  }

  public requestClose(): void {
    library.symbols.bridge_request_close();
  }

  public getTime(): number {
    return library.symbols.bridge_get_time();
  }

  public beginFrame(): void {
    library.symbols.bridge_begin_frame();
  }

  public endFrame(): void {
    library.symbols.bridge_end_frame();
  }

  public setCursorDisabled(disabled: boolean): void {
    library.symbols.bridge_set_cursor_disabled(disabled ? 1 : 0);
    this.lastCursorX = library.symbols.bridge_get_cursor_x();
    this.lastCursorY = library.symbols.bridge_get_cursor_y();
  }

  public pollInput(): InputState {
    library.symbols.bridge_poll_events();

    const cursorX = library.symbols.bridge_get_cursor_x();
    const cursorY = library.symbols.bridge_get_cursor_y();
    const typedText = library.symbols.bridge_get_typed_text().toString();
    const windowWidth = library.symbols.bridge_get_window_width();
    const windowHeight = library.symbols.bridge_get_window_height();
    const framebufferWidth = library.symbols.bridge_get_framebuffer_width();
    const framebufferHeight = library.symbols.bridge_get_framebuffer_height();
    const resized = Boolean(library.symbols.bridge_was_resized());
    const hotbarSelection = Boolean(library.symbols.bridge_consume_key_press(GLFW_KEY_1))
      ? 0
      : Boolean(library.symbols.bridge_consume_key_press(GLFW_KEY_2))
        ? 1
        : Boolean(library.symbols.bridge_consume_key_press(GLFW_KEY_3))
          ? 2
          : Boolean(library.symbols.bridge_consume_key_press(GLFW_KEY_4))
            ? 3
            : Boolean(library.symbols.bridge_consume_key_press(GLFW_KEY_5))
              ? 4
              : null;

    const input: InputState = {
      moveForward: Boolean(library.symbols.bridge_is_key_down(GLFW_KEY_W)),
      moveBackward: Boolean(library.symbols.bridge_is_key_down(GLFW_KEY_S)),
      moveLeft: Boolean(library.symbols.bridge_is_key_down(GLFW_KEY_A)),
      moveRight: Boolean(library.symbols.bridge_is_key_down(GLFW_KEY_D)),
      moveUp: Boolean(library.symbols.bridge_is_key_down(GLFW_KEY_SPACE)),
      moveDown: Boolean(library.symbols.bridge_is_key_down(GLFW_KEY_LEFT_SHIFT)),
      breakBlock: Boolean(
        library.symbols.bridge_is_mouse_button_down(GLFW_MOUSE_BUTTON_LEFT),
      ),
      placeBlock: Boolean(
        library.symbols.bridge_is_mouse_button_down(GLFW_MOUSE_BUTTON_RIGHT),
      ),
      exit: Boolean(library.symbols.bridge_is_key_down(GLFW_KEY_ESCAPE)),
      mouseDeltaX: cursorX - this.lastCursorX,
      mouseDeltaY: cursorY - this.lastCursorY,
      cursorX,
      cursorY,
      typedText,
      backspacePressed: Boolean(
        library.symbols.bridge_consume_key_press(GLFW_KEY_BACKSPACE),
      ),
      enterPressed: Boolean(
        library.symbols.bridge_consume_key_press(GLFW_KEY_ENTER),
      ),
      tabPressed: Boolean(
        library.symbols.bridge_consume_key_press(GLFW_KEY_TAB),
      ),
      hotbarSelection,
      windowWidth,
      windowHeight,
      framebufferWidth,
      framebufferHeight,
      resized,
    };

    this.lastCursorX = cursorX;
    this.lastCursorY = cursorY;
    library.symbols.bridge_consume_typed_text();
    if (resized) {
      library.symbols.bridge_consume_resize();
    }

    return input;
  }

  public gl = {
    viewport: (x: number, y: number, width: number, height: number): void =>
      library.symbols.bridge_gl_viewport(x, y, width, height),
    clearColor: (r: number, g: number, b: number, a: number): void =>
      library.symbols.bridge_gl_clear_color(r, g, b, a),
    clear: (mask: number): void => library.symbols.bridge_gl_clear(mask),
    enable: (capability: number): void => library.symbols.bridge_gl_enable(capability),
    disable: (capability: number): void => library.symbols.bridge_gl_disable(capability),
    cullFace: (mode: number): void => library.symbols.bridge_gl_cull_face(mode),
    depthFunc: (func: number): void => library.symbols.bridge_gl_depth_func(func),
    createShader: (type: number): number => library.symbols.bridge_gl_create_shader(type),
    shaderSource: (shader: number, source: string): void =>
      library.symbols.bridge_gl_shader_source(shader, cstring(source)),
    compileShader: (shader: number): boolean =>
      Boolean(library.symbols.bridge_gl_compile_shader(shader)),
    getShaderInfoLog: (shader: number): string =>
      library.symbols.bridge_gl_get_shader_info_log(shader).toString(),
    deleteShader: (shader: number): void => library.symbols.bridge_gl_delete_shader(shader),
    createProgram: (): number => library.symbols.bridge_gl_create_program(),
    attachShader: (program: number, shader: number): void =>
      library.symbols.bridge_gl_attach_shader(program, shader),
    linkProgram: (program: number): boolean =>
      Boolean(library.symbols.bridge_gl_link_program(program)),
    getProgramInfoLog: (program: number): string =>
      library.symbols.bridge_gl_get_program_info_log(program).toString(),
    useProgram: (program: number): void => library.symbols.bridge_gl_use_program(program),
    deleteProgram: (program: number): void => library.symbols.bridge_gl_delete_program(program),
    getUniformLocation: (program: number, name: string): number =>
      library.symbols.bridge_gl_get_uniform_location(program, cstring(name)),
    uniformMatrix4fv: (location: number, value: Float32Array): void =>
      library.symbols.bridge_gl_uniform_matrix4fv(location, ptr(value)),
    uniform1i: (location: number, value: number): void =>
      library.symbols.bridge_gl_uniform1i(location, value),
    genVertexArray: (): number => library.symbols.bridge_gl_gen_vertex_array(),
    genBuffer: (): number => library.symbols.bridge_gl_gen_buffer(),
    genTexture: (): number => library.symbols.bridge_gl_gen_texture(),
    bindVertexArray: (vao: number): void => library.symbols.bridge_gl_bind_vertex_array(vao),
    bindBuffer: (target: number, buffer: number): void =>
      library.symbols.bridge_gl_bind_buffer(target, buffer),
    activeTexture: (texture: number): void => library.symbols.bridge_gl_active_texture(texture),
    bindTexture: (target: number, texture: number): void =>
      library.symbols.bridge_gl_bind_texture(target, texture),
    bufferData: (
      target: number,
      value: Float32Array | Uint32Array,
      usage: number,
    ): void =>
      library.symbols.bridge_gl_buffer_data(target, ptr(value), value.byteLength, usage),
    texImage2D: (
      target: number,
      level: number,
      internalFormat: number,
      width: number,
      height: number,
      border: number,
      format: number,
      type: number,
      value: Uint8Array,
    ): void =>
      library.symbols.bridge_gl_tex_image_2d(
        target,
        level,
        internalFormat,
        width,
        height,
        border,
        format,
        type,
        ptr(value),
      ),
    texParameteri: (target: number, name: number, value: number): void =>
      library.symbols.bridge_gl_tex_parameteri(target, name, value),
    enableVertexAttribArray: (index: number): void =>
      library.symbols.bridge_gl_enable_vertex_attrib_array(index),
    vertexAttribPointer: (
      index: number,
      size: number,
      type: number,
      normalized: boolean,
      stride: number,
      offset: number,
    ): void =>
      library.symbols.bridge_gl_vertex_attrib_pointer(
        index,
        size,
        type,
        normalized ? 1 : 0,
        stride,
        offset,
      ),
    drawElements: (mode: number, count: number, type: number, offset: number): void =>
      library.symbols.bridge_gl_draw_elements(mode, count, type, offset),
    deleteVertexArray: (vao: number): void =>
      library.symbols.bridge_gl_delete_vertex_array(vao),
    deleteBuffer: (buffer: number): void => library.symbols.bridge_gl_delete_buffer(buffer),
    deleteTexture: (texture: number): void =>
      library.symbols.bridge_gl_delete_texture(texture),
  };
}

export const loadTextAsset = (relativePath: string): string =>
  readFileSync(join(rootDir, relativePath), "utf8");

export const loadBinaryAsset = (relativePath: string): Uint8Array =>
  new Uint8Array(readFileSync(join(rootDir, relativePath)));
