#version 330 core

in vec2 vUv;
in float vShade;
in float vSkyLight;
in float vBlockLight;

uniform sampler2D uAtlas;
uniform float uDaylight;
uniform float uForceSkyLight;
uniform float uForceBlockLight;

out vec4 fragColor;

void main() {
  vec4 sampled = texture(uAtlas, vUv);
  if (sampled.a < 0.5) {
    discard;
  }

  float rawSkyLight = uForceSkyLight >= 0.0 ? uForceSkyLight : vSkyLight;
  float rawBlockLight = uForceBlockLight >= 0.0 ? uForceBlockLight : vBlockLight;
  float skyLight = clamp(rawSkyLight / 15.0, 0.0, 1.0) * uDaylight;
  float blockLight = clamp(rawBlockLight / 15.0, 0.0, 1.0);
  float brightness = max(0.06, max(skyLight, blockLight));
  fragColor = vec4(sampled.rgb * vShade * brightness, sampled.a);
}
