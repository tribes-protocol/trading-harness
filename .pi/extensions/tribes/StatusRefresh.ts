/**
 * Broadcast by `/refresh`. Each status extension listens and re-pulls its own
 * data — it carries no shared state, so the extensions stay independent.
 */
export const STATUS_REFRESH_EVENT = 'tribes:status-refresh'
