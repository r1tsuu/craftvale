#version 330 core

layout (location = 0) in vec3 aPosition;
layout (location = 1) in vec2 aUv;
layout (location = 2) in float aShade;

uniform mat4 uViewProjection;

out vec2 vUv;
out float vShade;

void main() {
  vUv = aUv;
  vShade = aShade;
  gl_Position = uViewProjection * vec4(aPosition, 1.0);
}
