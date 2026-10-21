import type { SyncedPlayer } from './yt'

/** The single mounted YouTube player, shared with the duck loop and gesture handlers. */
export const playerRef: { current: SyncedPlayer | null } = { current: null }
