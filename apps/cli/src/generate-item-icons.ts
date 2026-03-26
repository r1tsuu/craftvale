import { writeItemIconAtlas } from "./item-icon-pipeline.ts";

const path = await writeItemIconAtlas();
console.log(`Wrote item icon atlas to ${path}`);
