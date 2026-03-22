import { existsSync } from "node:fs";
import { join } from "node:path";

const rootDir = import.meta.dir.endsWith("/scripts")
  ? import.meta.dir.slice(0, -"/scripts".length)
  : import.meta.dir;

const glfwCandidates = [
  { include: "/opt/homebrew/include", lib: "/opt/homebrew/lib" },
  { include: "/usr/local/include", lib: "/usr/local/lib" },
];

const glfwPath = glfwCandidates.find((candidate) =>
  existsSync(join(candidate.include, "GLFW", "glfw3.h")),
);

if (!glfwPath) {
  console.error("GLFW headers were not found.");
  console.error("Install GLFW first, for example: brew install glfw");
  process.exit(1);
}

const outputPath = join(rootDir, "native", "libvoxel_bridge.dylib");
const sourcePath = join(rootDir, "native", "bridge.c");

const command = [
  "clang",
  "-std=c11",
  "-O2",
  "-Wall",
  "-Wextra",
  "-dynamiclib",
  "-DGL_SILENCE_DEPRECATION",
  "-I",
  glfwPath.include,
  sourcePath,
  "-L",
  glfwPath.lib,
  "-lglfw",
  "-framework",
  "Cocoa",
  "-framework",
  "OpenGL",
  "-framework",
  "IOKit",
  "-framework",
  "CoreVideo",
  "-o",
  outputPath,
];

const result = Bun.spawnSync(command, {
  stdout: "inherit",
  stderr: "inherit",
});

if (result.exitCode !== 0) {
  process.exit(result.exitCode ?? 1);
}

console.log(`Built ${outputPath}`);
