import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { stdout } from 'node:process'

interface WriteOutputParams {
  readonly output: string
  readonly outPath: string | undefined
}

export async function writeOutput(params: WriteOutputParams): Promise<void> {
  if (params.outPath) {
    await mkdir(dirname(params.outPath), { recursive: true })
    await writeFile(params.outPath, `${params.output}\n`, 'utf8')
  }
  stdout.write(`${params.output}\n`)
}
