import { createLogger, parseClientDir, parseServerDir } from '@craftvale/core/shared'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'

import { clientAppRoot, serverAppRoot } from './paths.ts'

const argv = Bun.argv.slice(2)
const clientRoot = parseClientDir(argv, clientAppRoot)
const serverRoot = parseServerDir(argv, serverAppRoot)
const cleanDataLogger = createLogger('clean-data', 'gray')

if (clientRoot || serverRoot) {
  for (const root of [clientRoot, serverRoot]) {
    if (!root) {
      continue
    }

    await rm(root, {
      recursive: true,
      force: true,
    })
    cleanDataLogger.info(`removed ${root}`)
  }
} else {
  for (const root of [join(clientAppRoot, 'dist'), join(serverAppRoot, 'dist')]) {
    await rm(root, {
      recursive: true,
      force: true,
    })
    cleanDataLogger.info(`removed ${root}`)
  }
}
