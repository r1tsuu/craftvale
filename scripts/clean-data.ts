import { rm } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = import.meta.dir.endsWith("/scripts")
  ? import.meta.dir.slice(0, -"/scripts".length)
  : import.meta.dir;

const dataRoot = join(projectRoot, "data");

await rm(dataRoot, {
  recursive: true,
  force: true,
});

console.log(`[clean-data] removed ${dataRoot}`);
