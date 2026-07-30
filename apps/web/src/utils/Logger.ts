/* eslint-disable no-console */
// The single sanctioned `console` call site in this app. Every other module imports
// these functions instead, so the day this needs to ship to a real sink (Sentry, the
// gateway, a ring buffer for the status bar) exactly one file changes. Inbound frames
// come off a socket the browser does not control, so dropped-frame diagnostics have
// to go somewhere the developer can see.
export function logWarn(message: string): void {
  console.warn(message)
}

export function logError(message: string): void {
  console.error(message)
}
/* eslint-enable no-console */
