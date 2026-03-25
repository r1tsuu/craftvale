import { rm } from "node:fs/promises";
import { join } from "node:path";
import { parseClientDir, parseServerDir } from "../src/utils/cli.ts";
import { createLogger } from "../src/utils/logger.ts";

const projectRoot = import.meta.dir.endsWith("/scripts")
  ? import.meta.dir.slice(0, -"/scripts".length)
  : import.meta.dir;

const argv = Bun.argv.slice(2);
const clientRoot = parseClientDir(argv);
const serverRoot = parseServerDir(argv);
const cleanDataLogger = createLogger("clean-data", "gray");

if (clientRoot || serverRoot) {
  for (const root of [clientRoot, serverRoot]) {
    if (!root) {
      continue;
    }

    await rm(root, {
      recursive: true,
      force: true,
    });
    cleanDataLogger.info(`removed ${root}`);
  }
} else {
  for (const root of [join(projectRoot, "client"), join(projectRoot, "server")]) {
    await rm(root, {
      recursive: true,
      force: true,
    });
    cleanDataLogger.info(`removed ${root}`);
  }
}
