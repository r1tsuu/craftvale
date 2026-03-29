import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { projectRoot } from './paths.ts'

const GLFW_VERSION = '3.4'
const GLFW_SOURCE_ARCHIVE_URL = `https://github.com/glfw/glfw/releases/download/${GLFW_VERSION}/glfw-${GLFW_VERSION}.zip`
const GLFW_SOURCE_ARCHIVE_ROOT = `glfw-${GLFW_VERSION}`
const lightingOutputPath = join(projectRoot, 'native', 'liblighting.dylib')

interface GlfwBuildInput {
  includeDir: string
  libraryPath: string
  source: string
}

const normalizePlatformArch = (arch: NodeJS.Architecture): string =>
  arch === 'x64' ? 'x86_64' : arch

const platformKey = `${process.platform}-${normalizePlatformArch(process.arch)}`
const macosDeploymentTarget = process.env.MACOSX_DEPLOYMENT_TARGET ?? '14.0'
const glfwCacheRoot = join(projectRoot, 'native', 'vendor', 'glfw', GLFW_VERSION, platformKey)
const glfwSourceRoot = join(glfwCacheRoot, 'source')
const glfwBuildRoot = join(glfwCacheRoot, 'build')
const glfwInstallRoot = join(glfwCacheRoot, 'install')

const getCachedGlfwBuildInput = (): GlfwBuildInput => ({
  includeDir: join(glfwInstallRoot, 'include'),
  libraryPath: join(glfwInstallRoot, 'lib', 'libglfw3.a'),
  source: `locally built GLFW ${GLFW_VERSION} source`,
})

const isGlfwBuildInputReady = (input: GlfwBuildInput): boolean =>
  existsSync(join(input.includeDir, 'GLFW', 'glfw3.h')) && existsSync(input.libraryPath)

const requireCommand = (command: string, hint: string): void => {
  if (Bun.which(command)) {
    return
  }

  console.error(`Required command "${command}" was not found.`)
  console.error(hint)
  process.exit(1)
}

const runCommand = (command: string[], label: string): void => {
  const result = Bun.spawnSync(command, {
    stdout: 'inherit',
    stderr: 'inherit',
  })

  if (result.exitCode !== 0) {
    console.error(`${label} failed.`)
    process.exit(result.exitCode ?? 1)
  }
}

const downloadAndExtractGlfwSource = async (): Promise<void> => {
  console.log(`Downloading GLFW ${GLFW_VERSION} source...`)

  const response = await fetch(GLFW_SOURCE_ARCHIVE_URL)
  if (!response.ok) {
    throw new Error(
      `Failed to download GLFW source archive: ${response.status} ${response.statusText}`,
    )
  }

  const tempRoot = mkdtempSync(join(tmpdir(), 'craftvale-glfw-source-'))
  const archivePath = join(tempRoot, `glfw-${GLFW_VERSION}.zip`)
  const extractRoot = join(tempRoot, 'extract')

  try {
    await Bun.write(archivePath, await response.arrayBuffer())
    mkdirSync(extractRoot, { recursive: true })

    runCommand(['unzip', '-oq', archivePath, '-d', extractRoot], 'Extracting GLFW source archive')

    const extractedRoot = join(extractRoot, GLFW_SOURCE_ARCHIVE_ROOT)
    if (!existsSync(join(extractedRoot, 'CMakeLists.txt'))) {
      throw new Error('Downloaded GLFW source archive did not contain the expected project files.')
    }

    mkdirSync(glfwCacheRoot, { recursive: true })
    rmSync(glfwSourceRoot, { recursive: true, force: true })
    cpSync(extractedRoot, glfwSourceRoot, { recursive: true })
  } finally {
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

const ensureGlfwBuilt = async (): Promise<GlfwBuildInput> => {
  const cached = getCachedGlfwBuildInput()
  if (isGlfwBuildInputReady(cached)) {
    return cached
  }

  requireCommand(
    'cmake',
    'Install CMake so GLFW can be configured and built from source the first time build:native runs.',
  )
  requireCommand(
    'unzip',
    'Install the unzip command-line tool so the downloaded GLFW source archive can be extracted.',
  )

  if (!existsSync(join(glfwSourceRoot, 'CMakeLists.txt'))) {
    await downloadAndExtractGlfwSource()
  }

  rmSync(glfwBuildRoot, { recursive: true, force: true })
  rmSync(glfwInstallRoot, { recursive: true, force: true })
  mkdirSync(glfwBuildRoot, { recursive: true })

  const configureCommand = [
    'cmake',
    '-S',
    glfwSourceRoot,
    '-B',
    glfwBuildRoot,
    '-D',
    'CMAKE_BUILD_TYPE=Release',
    '-D',
    `CMAKE_OSX_ARCHITECTURES=${normalizePlatformArch(process.arch)}`,
    '-D',
    `CMAKE_OSX_DEPLOYMENT_TARGET=${macosDeploymentTarget}`,
    '-D',
    'BUILD_SHARED_LIBS=OFF',
    '-D',
    'GLFW_BUILD_DOCS=OFF',
    '-D',
    'GLFW_BUILD_TESTS=OFF',
    '-D',
    'GLFW_BUILD_EXAMPLES=OFF',
    '-D',
    'GLFW_INSTALL=ON',
  ]

  if (Bun.which('ninja')) {
    configureCommand.push('-G', 'Ninja')
  }

  console.log(`Building GLFW ${GLFW_VERSION} from source for ${platformKey}...`)
  runCommand(configureCommand, 'Configuring GLFW source build')
  runCommand(['cmake', '--build', glfwBuildRoot, '--config', 'Release'], 'Building GLFW source')
  runCommand(
    ['cmake', '--install', glfwBuildRoot, '--config', 'Release', '--prefix', glfwInstallRoot],
    'Installing built GLFW artifacts',
  )

  if (!isGlfwBuildInputReady(cached)) {
    throw new Error('GLFW source build completed but the installed cache is incomplete.')
  }

  return cached
}

if (process.platform !== 'darwin') {
  console.error('The native bridge build currently supports macOS only.')
  process.exit(1)
}

const glfwBuildInput = await ensureGlfwBuilt()
console.log(`Using ${glfwBuildInput.source}.`)

const outputPath = join(projectRoot, 'native', 'libvoxel_bridge.dylib')
const sourcePath = join(projectRoot, 'native', 'bridge.c')

const command = [
  'clang',
  '-std=c11',
  '-O2',
  '-Wall',
  '-Wextra',
  '-dynamiclib',
  '-DGL_SILENCE_DEPRECATION',
  `-mmacosx-version-min=${macosDeploymentTarget}`,
  '-I',
  glfwBuildInput.includeDir,
  sourcePath,
  glfwBuildInput.libraryPath,
  '-framework',
  'Cocoa',
  '-framework',
  'OpenGL',
  '-framework',
  'IOKit',
  '-framework',
  'CoreVideo',
  '-o',
  outputPath,
]

runCommand(command, 'Building Craftvale native bridge')
console.log(`Built ${outputPath}`)
runCommand(
  [
    'clang',
    '-std=c11',
    '-O3',
    '-Wall',
    '-Wextra',
    '-dynamiclib',
    `-mmacosx-version-min=${macosDeploymentTarget}`,
    join(projectRoot, 'native', 'lighting_relight.c'),
    join(projectRoot, 'native', 'lighting_borders.c'),
    '-o',
    lightingOutputPath,
  ],
  'Building Craftvale native lighting module',
)
console.log(`Built ${lightingOutputPath}`)
