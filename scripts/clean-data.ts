import { rm } from "node:fs/promises";
import { join } from "node:path";
import { parseDataDir } from "../src/utils/cli.ts";
import { createLogger } from "../src/utils/logger.ts";

const projectRoot = import.meta.dir.endsWith("/scripts")
  ? import.meta.dir.slice(0, -"/scripts".length)
  : import.meta.dir;

const dataRoot = parseDataDir(Bun.argv.slice(2)) ?? join(projectRoot, "data");
const cleanDataLogger = createLogger("clean-data", "gray");

await rm(dataRoot, {
  recursive: true,
  force: true,
});

cleanDataLogger.info(`removed ${dataRoot}`);
