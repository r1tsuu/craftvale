import { writeVoxelAtlasFromSourceTiles } from './voxel-atlas-pipeline.ts'

const atlasPath = await writeVoxelAtlasFromSourceTiles()
console.log(`Wrote ${atlasPath}`)
