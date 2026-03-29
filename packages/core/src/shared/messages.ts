import type {
  BlockId,
  ChatEntry,
  ChunkCoord,
  DroppedItemSnapshot,
  EntityId,
  InventorySnapshot,
  PlayerName,
  PlayerSnapshot,
  PlayerState,
} from '../types.ts'
import type { WorldTimeState } from './lighting.ts'

export interface WorldSummary {
  name: string
  seed: number
  createdAt: number
  updatedAt: number
}

export interface CreateWorldRequest {
  name: string
  seed: number
}

export interface JoinWorldRequest {
  playerName: PlayerName
}

export interface JoinServerRequest {
  playerName: PlayerName
}

export interface DeleteWorldRequest {
  name: string
}

export interface ChunkRequest {
  coords: ChunkCoord[]
}

export interface ChunkPayload {
  coord: ChunkCoord
  blocks: Uint8Array
  skyLight: Uint8Array
  blockLight: Uint8Array
  revision: number
}

export interface BlockMutationRequest {
  x: number
  y: number
  z: number
  blockId: BlockId
}

export interface BlockUseRequest {
  x: number
  y: number
  z: number
}

export interface InventorySelectionRequest {
  slot: number
}

export interface InventoryInteractionRequest {
  slot: number
}

export interface PlayerStateUpdateRequest {
  state: PlayerState
  flying: boolean
}

export interface SubmitChatRequest {
  text: string
}

export interface SaveStatusPayload {
  worldName: string
  savedChunks: number
  success: boolean
  kind: 'manual' | 'auto'
  error?: string
}

export interface ServerStatsPayload {
  tps: number
}

export type LoadingProgressStage =
  | 'preparing-world'
  | 'generating-startup-area'
  | 'synchronizing-initial-state'
  | 'ready'

export interface LoadingProgressPayload {
  worldName: string
  stage: LoadingProgressStage
  statusText: string
  completedUnits: number
  totalUnits: number
  completedChunks: number
  totalChunks: number
}

export interface JoinedWorldPayload {
  world: WorldSummary
  worldTime: WorldTimeState
  clientPlayerName: PlayerName
  clientPlayer: PlayerSnapshot
  players: PlayerSnapshot[]
  inventory: InventorySnapshot
  droppedItems: DroppedItemSnapshot[]
}

export interface ClientRequestMap {
  listWorlds: Record<string, never>
  createWorld: CreateWorldRequest
  joinWorld: JoinWorldRequest
  joinServer: JoinServerRequest
  requestChunks: ChunkRequest
  saveWorld: Record<string, never>
  deleteWorld: DeleteWorldRequest
}

export interface ClientResponseMap {
  listWorlds: { worlds: WorldSummary[] }
  createWorld: { world: WorldSummary }
  joinWorld: JoinedWorldPayload
  joinServer: JoinedWorldPayload
  requestChunks: { accepted: number }
  saveWorld: { world: WorldSummary; savedChunks: number }
  deleteWorld: { deleted: boolean; name: string }
}

export interface ClientEventMap {
  mutateBlock: BlockMutationRequest
  useBlock: BlockUseRequest
  selectInventorySlot: InventorySelectionRequest
  interactInventorySlot: InventoryInteractionRequest
  updatePlayerState: PlayerStateUpdateRequest
  submitChat: SubmitChatRequest
  dropItem: { slot: number; count: number }
}

export interface ServerEventMap {
  joinedWorld: JoinedWorldPayload
  chunkDelivered: { chunk: ChunkPayload }
  chunkChanged: { chunk: ChunkPayload }
  inventoryUpdated: {
    playerEntityId: EntityId
    playerName: PlayerName
    inventory: InventorySnapshot
  }
  droppedItemSpawned: { item: DroppedItemSnapshot }
  droppedItemUpdated: { item: DroppedItemSnapshot }
  droppedItemRemoved: { entityId: EntityId }
  playerJoined: { player: PlayerSnapshot }
  playerUpdated: { player: PlayerSnapshot }
  playerLeft: { playerEntityId: EntityId; playerName: PlayerName }
  chatMessage: { entry: ChatEntry }
  loadingProgress: LoadingProgressPayload
  worldTimeUpdated: { worldTime: WorldTimeState }
  serverStats: ServerStatsPayload
  saveStatus: SaveStatusPayload
  worldDeleted: { name: string }
  serverError: { message: string; requestId?: string }
}

export type ClientRequestMessage = {
  [K in keyof ClientRequestMap]: { type: K; payload: ClientRequestMap[K] }
}[keyof ClientRequestMap]

export type ClientEventMessage = {
  [K in keyof ClientEventMap]: { type: K; payload: ClientEventMap[K] }
}[keyof ClientEventMap]

export type ServerEventMessage = {
  [K in keyof ServerEventMap]: { type: K; payload: ServerEventMap[K] }
}[keyof ServerEventMap]

export interface RequestEnvelope<TType extends string = string, TPayload = unknown> {
  kind: 'request'
  id: string
  type: TType
  payload: TPayload
}

export interface ResponseEnvelope<TType extends string = string, TPayload = unknown> {
  kind: 'response'
  id: string
  type: TType
  ok: boolean
  payload?: TPayload
  error?: string
}

export interface EventEnvelope<TType extends string = string, TPayload = unknown> {
  kind: 'event'
  type: TType
  payload: TPayload
}

export type ClientToServerMessage =
  | RequestEnvelope<keyof ClientRequestMap, ClientRequestMap[keyof ClientRequestMap]>
  | EventEnvelope<keyof ClientEventMap, ClientEventMap[keyof ClientEventMap]>

export type ServerToClientMessage =
  | ResponseEnvelope<keyof ClientRequestMap, ClientResponseMap[keyof ClientResponseMap]>
  | EventEnvelope<keyof ServerEventMap, ServerEventMap[keyof ServerEventMap]>

const CLIENT_REQUEST_TYPES = new Set<keyof ClientRequestMap>([
  'listWorlds',
  'createWorld',
  'joinWorld',
  'joinServer',
  'requestChunks',
  'saveWorld',
  'deleteWorld',
])

const CLIENT_EVENT_TYPES = new Set<keyof ClientEventMap>([
  'mutateBlock',
  'useBlock',
  'selectInventorySlot',
  'interactInventorySlot',
  'updatePlayerState',
  'submitChat',
  'dropItem',
])

const SERVER_EVENT_TYPES = new Set<keyof ServerEventMap>([
  'joinedWorld',
  'chunkDelivered',
  'chunkChanged',
  'inventoryUpdated',
  'droppedItemSpawned',
  'droppedItemUpdated',
  'droppedItemRemoved',
  'playerJoined',
  'playerUpdated',
  'playerLeft',
  'chatMessage',
  'loadingProgress',
  'worldTimeUpdated',
  'serverStats',
  'saveStatus',
  'worldDeleted',
  'serverError',
])

export const isClientRequestType = (type: string): type is keyof ClientRequestMap =>
  CLIENT_REQUEST_TYPES.has(type as keyof ClientRequestMap)

export const isClientEventType = (type: string): type is keyof ClientEventMap =>
  CLIENT_EVENT_TYPES.has(type as keyof ClientEventMap)

export const isServerEventType = (type: string): type is keyof ServerEventMap =>
  SERVER_EVENT_TYPES.has(type as keyof ServerEventMap)
