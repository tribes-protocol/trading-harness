import { dirname } from 'node:path'

import { mkdir, writeFile } from 'fs/promises'

interface WriteOutputParams {
  readonly output: string
  readonly outPath: string | undefined
}

export async function writeOutput(params: WriteOutputParams): Promise<void> {
  if (params.outPath) {
    await mkdir(dirname(params.outPath), { recursive: true })
    await writeFile(params.outPath, `${params.output}\n`, 'utf8')
  }
  console.log(params.output)
}
