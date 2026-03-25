#version 330 core

in vec2 vUv;
in float vShade;
in float vSkyLight;
in float vBlockLight;

uniform sampler2D uAtlas;
uniform float uDaylight;

out vec4 fragColor;

void main() {
  vec4 sampled = texture(uAtlas, vUv);
  if (sampled.a < 0.5) {
    discard;
  }

  float skyLight = clamp(vSkyLight / 15.0, 0.0, 1.0) * uDaylight;
  float blockLight = clamp(vBlockLight / 15.0, 0.0, 1.0);
  float brightness = max(0.06, max(skyLight, blockLight));
  fragColor = vec4(sampled.rgb * vShade * brightness, sampled.a);
}
