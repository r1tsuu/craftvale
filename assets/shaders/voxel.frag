#version 330 core

in vec2 vUv;
in float vShade;

uniform sampler2D uAtlas;

out vec4 fragColor;

void main() {
  vec4 sampled = texture(uAtlas, vUv);
  if (sampled.a < 0.5) {
    discard;
  }

  fragColor = vec4(sampled.rgb * vShade, sampled.a);
}
