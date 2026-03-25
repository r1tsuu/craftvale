#version 330 core

layout (location = 0) in vec3 aPosition;
layout (location = 1) in vec2 aUv;
layout (location = 2) in float aShade;
layout (location = 3) in float aSkyLight;
layout (location = 4) in float aBlockLight;

uniform mat4 uViewProjection;
uniform mat4 uModel;

out vec2 vUv;
out float vShade;
out float vSkyLight;
out float vBlockLight;

void main() {
  vUv = aUv;
  vShade = aShade;
  vSkyLight = aSkyLight;
  vBlockLight = aBlockLight;
  gl_Position = uViewProjection * uModel * vec4(aPosition, 1.0);
}
