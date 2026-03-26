export const getBaseWindowTitle = (playerName: string): string => `Craftvale - ${playerName}`

export const getSessionWindowTitle = (options: {
  playerName: string
  appMode: 'menu' | 'loading' | 'playing'
  connectionMode: 'local' | 'remote' | null
  currentWorldName: string | null
  connectedServerAddress: string | null
}): string => {
  const baseTitle = getBaseWindowTitle(options.playerName)
  if (options.appMode !== 'playing') {
    return baseTitle
  }

  if (options.connectionMode === 'remote' && options.connectedServerAddress) {
    return `${baseTitle} - ${options.connectedServerAddress}`
  }

  if (options.connectionMode === 'local' && options.currentWorldName) {
    return `${baseTitle} - ${options.currentWorldName}`
  }

  if (options.currentWorldName) {
    return `${baseTitle} - ${options.currentWorldName}`
  }

  return baseTitle
}
