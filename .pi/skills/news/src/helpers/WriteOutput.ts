import { dirname } from 'node:path'
import { stderr, stdout } from 'node:process'

import { mkdir, writeFile } from 'fs/promises'

import type { WriteOutputParams } from '@/types/WriteOutput'

export async function writeOutput(params: WriteOutputParams): Promise<void> {
  if (params.outPath) {
    await mkdir(dirname(params.outPath), { recursive: true })
    await writeFile(params.outPath, `${params.output}\n`, 'utf8')
  }
  stdout.write(`${params.output}\n`)
}

export function writeCliError(message: string): void {
  stderr.write(`${message}\n`)
}
