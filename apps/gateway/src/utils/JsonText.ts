/* eslint-disable lucy/no-json-stringify */
// This file is the gateway's one sanctioned JSON.stringify wrapper, the same
// arrangement the CLI uses for toJsonTreeString: every other module serializes
// through toJsonText / toPrettyJsonText so wire frames and tool argument
// previews share a single serializer.

/** Compact form, used for outbound wire frames. */
export function toJsonText(value: unknown): string {
  return JSON.stringify(value) ?? ''
}

/** Two-space indented form, used for the human-readable tool argument preview. */
export function toPrettyJsonText(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? ''
}
/* eslint-enable lucy/no-json-stringify */
