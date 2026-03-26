import { dirname, join } from 'node:path'

export const cliAppRoot = dirname(import.meta.dir)
export const projectRoot = join(cliAppRoot, '..', '..')
export const clientAppRoot = join(projectRoot, 'apps', 'client')
export const serverAppRoot = join(projectRoot, 'apps', 'dedicated-server')
