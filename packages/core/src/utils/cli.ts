import { resolve } from 'node:path'

export const parseCliFlagValue = (argv: readonly string[], flagName: string): string | null => {
  const flag = `--${flagName}`
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === flag) {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error(`Missing value for ${flag}.`)
      }
      return value
    }

    if (argument.startsWith(`${flag}=`)) {
      const value = argument.slice(flag.length + 1)
      if (!value) {
        throw new Error(`Missing value for ${flag}.`)
      }
      return value
    }
  }

  return null
}

const parsePathFlag = (
  argv: readonly string[],
  flagName: string,
  baseDir = process.cwd(),
): string | undefined => {
  const value = parseCliFlagValue(argv, flagName)
  if (value === null) {
    return undefined
  }

  const normalized = value.trim()
  if (!normalized) {
    throw new Error(`Missing value for --${flagName}.`)
  }

  return resolve(baseDir, normalized)
}

export const parseClientDir = (argv: readonly string[], baseDir?: string): string | undefined =>
  parsePathFlag(argv, 'client-dir', baseDir)

export const parseServerDir = (argv: readonly string[], baseDir?: string): string | undefined =>
  parsePathFlag(argv, 'server-dir', baseDir)
