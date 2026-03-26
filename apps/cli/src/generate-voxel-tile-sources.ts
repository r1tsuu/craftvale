import { writeDefaultVoxelTileSources } from "./voxel-atlas-pipeline.ts";

const writtenPaths = await writeDefaultVoxelTileSources();
console.log(`Wrote ${writtenPaths.length} tile source PNGs.`);
