#define GLFW_INCLUDE_GLCOREARB
#include <GLFW/glfw3.h>

#include <stdint.h>
#include <stdio.h>
#include <string.h>

static GLFWwindow *g_window = NULL;
static int g_window_width = 0;
static int g_window_height = 0;
static int g_framebuffer_width = 0;
static int g_framebuffer_height = 0;
static int g_resized = 0;
static double g_cursor_x = 0.0;
static double g_cursor_y = 0.0;
static char g_info_log[4096];
static char g_typed_text[256];
static int g_typed_text_length = 0;
static int g_pressed_keys[GLFW_KEY_LAST + 1];
static int g_pressed_mouse_buttons[GLFW_MOUSE_BUTTON_LAST + 1];

static void window_size_callback(GLFWwindow *window, int width, int height) {
  (void)window;
  g_window_width = width;
  g_window_height = height;
}

static void framebuffer_size_callback(GLFWwindow *window, int width, int height) {
  (void)window;
  g_framebuffer_width = width;
  g_framebuffer_height = height;
  g_resized = 1;
}

static void cursor_position_callback(GLFWwindow *window, double x, double y) {
  (void)window;
  g_cursor_x = x;
  g_cursor_y = y;
}

static void key_callback(
    GLFWwindow *window,
    int key,
    int scancode,
    int action,
    int mods) {
  (void)window;
  (void)scancode;
  (void)mods;

  if (action == GLFW_PRESS && key >= 0 && key <= GLFW_KEY_LAST) {
    g_pressed_keys[key] = 1;
  }
}

static void mouse_button_callback(
    GLFWwindow *window,
    int button,
    int action,
    int mods) {
  (void)window;
  (void)mods;

  if (action == GLFW_PRESS && button >= 0 && button <= GLFW_MOUSE_BUTTON_LAST) {
    g_pressed_mouse_buttons[button] = 1;
  }
}

static void char_callback(GLFWwindow *window, unsigned int codepoint) {
  (void)window;

  if (codepoint < 32 || codepoint > 126) {
    return;
  }

  if (g_typed_text_length >= (int)sizeof(g_typed_text) - 1) {
    return;
  }

  g_typed_text[g_typed_text_length++] = (char)codepoint;
  g_typed_text[g_typed_text_length] = '\0';
}

static const char *copy_shader_log(GLuint shader) {
  GLsizei length = 0;
  glGetShaderInfoLog(shader, (GLsizei)sizeof(g_info_log), &length, g_info_log);
  g_info_log[length] = '\0';
  return g_info_log;
}

static const char *copy_program_log(GLuint program) {
  GLsizei length = 0;
  glGetProgramInfoLog(program, (GLsizei)sizeof(g_info_log), &length, g_info_log);
  g_info_log[length] = '\0';
  return g_info_log;
}

int bridge_init_window(int width, int height, const char *title) {
  if (!glfwInit()) {
    return 0;
  }

  glfwWindowHint(GLFW_CONTEXT_VERSION_MAJOR, 3);
  glfwWindowHint(GLFW_CONTEXT_VERSION_MINOR, 3);
  glfwWindowHint(GLFW_OPENGL_PROFILE, GLFW_OPENGL_CORE_PROFILE);
#ifdef __APPLE__
  glfwWindowHint(GLFW_OPENGL_FORWARD_COMPAT, GLFW_TRUE);
#endif

  g_window = glfwCreateWindow(width, height, title, NULL, NULL);
  if (!g_window) {
    glfwTerminate();
    return 0;
  }

  glfwMakeContextCurrent(g_window);
  glfwSwapInterval(1);
  glfwSetWindowSizeCallback(g_window, window_size_callback);
  glfwSetFramebufferSizeCallback(g_window, framebuffer_size_callback);
  glfwSetCursorPosCallback(g_window, cursor_position_callback);
  glfwSetKeyCallback(g_window, key_callback);
  glfwSetMouseButtonCallback(g_window, mouse_button_callback);
  glfwSetCharCallback(g_window, char_callback);
  glfwGetWindowSize(g_window, &g_window_width, &g_window_height);
  glfwGetFramebufferSize(g_window, &g_framebuffer_width, &g_framebuffer_height);
  glfwGetCursorPos(g_window, &g_cursor_x, &g_cursor_y);
  memset(g_pressed_keys, 0, sizeof(g_pressed_keys));
  memset(g_pressed_mouse_buttons, 0, sizeof(g_pressed_mouse_buttons));
  g_typed_text[0] = '\0';
  g_typed_text_length = 0;
  g_resized = 1;
  return 1;
}

void bridge_shutdown(void) {
  if (g_window) {
    glfwDestroyWindow(g_window);
    g_window = NULL;
  }
  glfwTerminate();
}

void bridge_poll_events(void) {
  glfwPollEvents();
}

int bridge_window_should_close(void) {
  return g_window ? glfwWindowShouldClose(g_window) : 1;
}

void bridge_request_close(void) {
  if (g_window) {
    glfwSetWindowShouldClose(g_window, GLFW_TRUE);
  }
}

void bridge_begin_frame(void) {
}

void bridge_end_frame(void) {
  if (g_window) {
    glfwSwapBuffers(g_window);
  }
}

double bridge_get_time(void) {
  return glfwGetTime();
}

void bridge_set_window_title(const char *title) {
  if (!g_window) {
    return;
  }

  glfwSetWindowTitle(g_window, title);
}

void bridge_set_cursor_disabled(int disabled) {
  if (!g_window) {
    return;
  }
  glfwSetInputMode(
      g_window,
      GLFW_CURSOR,
      disabled ? GLFW_CURSOR_DISABLED : GLFW_CURSOR_NORMAL);
}

int bridge_is_key_down(int key) {
  if (!g_window) {
    return 0;
  }
  return glfwGetKey(g_window, key) == GLFW_PRESS;
}

int bridge_is_mouse_button_down(int button) {
  if (!g_window) {
    return 0;
  }
  return glfwGetMouseButton(g_window, button) == GLFW_PRESS;
}

const char *bridge_get_typed_text(void) {
  return g_typed_text;
}

void bridge_consume_typed_text(void) {
  g_typed_text[0] = '\0';
  g_typed_text_length = 0;
}

int bridge_consume_key_press(int key) {
  if (key < 0 || key > GLFW_KEY_LAST) {
    return 0;
  }

  int pressed = g_pressed_keys[key];
  g_pressed_keys[key] = 0;
  return pressed;
}

int bridge_consume_mouse_button_press(int button) {
  if (button < 0 || button > GLFW_MOUSE_BUTTON_LAST) {
    return 0;
  }

  int pressed = g_pressed_mouse_buttons[button];
  g_pressed_mouse_buttons[button] = 0;
  return pressed;
}

double bridge_get_cursor_x(void) {
  return g_cursor_x;
}

double bridge_get_cursor_y(void) {
  return g_cursor_y;
}

int bridge_get_framebuffer_width(void) {
  return g_framebuffer_width;
}

int bridge_get_framebuffer_height(void) {
  return g_framebuffer_height;
}

int bridge_get_window_width(void) {
  return g_window_width;
}

int bridge_get_window_height(void) {
  return g_window_height;
}

int bridge_was_resized(void) {
  return g_resized;
}

void bridge_consume_resize(void) {
  g_resized = 0;
}

void bridge_gl_viewport(int x, int y, int width, int height) {
  glViewport(x, y, width, height);
}

void bridge_gl_clear_color(float r, float g, float b, float a) {
  glClearColor(r, g, b, a);
}

void bridge_gl_clear(unsigned int mask) {
  glClear(mask);
}

void bridge_gl_enable(unsigned int capability) {
  glEnable(capability);
}

void bridge_gl_disable(unsigned int capability) {
  glDisable(capability);
}

void bridge_gl_blend_func(unsigned int source, unsigned int destination) {
  glBlendFunc(source, destination);
}

void bridge_gl_cull_face(unsigned int mode) {
  glCullFace(mode);
}

void bridge_gl_depth_func(unsigned int func) {
  glDepthFunc(func);
}

GLuint bridge_gl_create_shader(unsigned int type) {
  return glCreateShader(type);
}

void bridge_gl_shader_source(GLuint shader, const char *source) {
  glShaderSource(shader, 1, &source, NULL);
}

int bridge_gl_compile_shader(GLuint shader) {
  GLint success = 0;
  glCompileShader(shader);
  glGetShaderiv(shader, GL_COMPILE_STATUS, &success);
  return success;
}

const char *bridge_gl_get_shader_info_log(GLuint shader) {
  return copy_shader_log(shader);
}

void bridge_gl_delete_shader(GLuint shader) {
  glDeleteShader(shader);
}

GLuint bridge_gl_create_program(void) {
  return glCreateProgram();
}

void bridge_gl_attach_shader(GLuint program, GLuint shader) {
  glAttachShader(program, shader);
}

int bridge_gl_link_program(GLuint program) {
  GLint success = 0;
  glLinkProgram(program);
  glGetProgramiv(program, GL_LINK_STATUS, &success);
  return success;
}

const char *bridge_gl_get_program_info_log(GLuint program) {
  return copy_program_log(program);
}

void bridge_gl_use_program(GLuint program) {
  glUseProgram(program);
}

void bridge_gl_delete_program(GLuint program) {
  glDeleteProgram(program);
}

int bridge_gl_get_uniform_location(GLuint program, const char *name) {
  return glGetUniformLocation(program, name);
}

void bridge_gl_uniform_matrix4fv(int location, const float *value) {
  glUniformMatrix4fv(location, 1, GL_FALSE, value);
}

void bridge_gl_uniform1i(int location, int value) {
  glUniform1i(location, value);
}

void bridge_gl_uniform1f(int location, float value) {
  glUniform1f(location, value);
}

GLuint bridge_gl_gen_vertex_array(void) {
  GLuint vao = 0;
  glGenVertexArrays(1, &vao);
  return vao;
}

GLuint bridge_gl_gen_buffer(void) {
  GLuint buffer = 0;
  glGenBuffers(1, &buffer);
  return buffer;
}

GLuint bridge_gl_gen_texture(void) {
  GLuint texture = 0;
  glGenTextures(1, &texture);
  return texture;
}

void bridge_gl_bind_vertex_array(GLuint vao) {
  glBindVertexArray(vao);
}

void bridge_gl_bind_buffer(unsigned int target, GLuint buffer) {
  glBindBuffer(target, buffer);
}

void bridge_gl_active_texture(unsigned int texture) {
  glActiveTexture(texture);
}

void bridge_gl_bind_texture(unsigned int target, GLuint texture) {
  glBindTexture(target, texture);
}

void bridge_gl_buffer_data(
    unsigned int target,
    const void *data,
    int size,
    unsigned int usage) {
  glBufferData(target, size, data, usage);
}

void bridge_gl_tex_image_2d(
    unsigned int target,
    int level,
    int internal_format,
    int width,
    int height,
    int border,
    unsigned int format,
    unsigned int type,
    const void *data) {
  glTexImage2D(
      target,
      level,
      internal_format,
      width,
      height,
      border,
      format,
      type,
      data);
}

void bridge_gl_tex_parameteri(unsigned int target, unsigned int name, int value) {
  glTexParameteri(target, name, value);
}

void bridge_gl_enable_vertex_attrib_array(unsigned int index) {
  glEnableVertexAttribArray(index);
}

void bridge_gl_vertex_attrib_pointer(
    unsigned int index,
    int size,
    unsigned int type,
    int normalized,
    int stride,
    int offset) {
  glVertexAttribPointer(
      index,
      size,
      type,
      normalized ? GL_TRUE : GL_FALSE,
      stride,
      (const void *)(uintptr_t)offset);
}

void bridge_gl_draw_elements(
    unsigned int mode,
    int count,
    unsigned int type,
    int offset) {
  glDrawElements(mode, count, type, (const void *)(uintptr_t)offset);
}

void bridge_gl_delete_vertex_array(GLuint vao) {
  glDeleteVertexArrays(1, &vao);
}

void bridge_gl_delete_buffer(GLuint buffer) {
  glDeleteBuffers(1, &buffer);
}

void bridge_gl_delete_texture(GLuint texture) {
  glDeleteTextures(1, &texture);
}
