export function appendStringValue(value: string, previous: string[] | undefined): string[] {
  return [...(previous ?? []), value]
}

export function appendNumberValue(value: string, previous: number[] | undefined): number[] {
  return [...(previous ?? []), Number(value)]
}
