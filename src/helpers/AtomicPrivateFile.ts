import { randomUUID } from 'node:crypto'
import { chmod, mkdir, open, rename, unlink } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export async function writePrivateFileAtomic(
  path: string,
  body: string,
  options: { secureDirectory?: boolean } = {}
): Promise<void> {
  const directory = dirname(path)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  if (options.secureDirectory !== false) await chmod(directory, 0o700)

  const temporary = join(directory, `.${basename(path)}.${process.pid}.${randomUUID()}.tmp`)
  let handle: Awaited<ReturnType<typeof open>> | undefined
  try {
    handle = await open(temporary, 'wx', 0o600)
    await handle.writeFile(body, { encoding: 'utf8' })
    await handle.sync()
    await handle.close()
    handle = undefined
    await rename(temporary, path)
    await chmod(path, 0o600)
    let directoryHandle: Awaited<ReturnType<typeof open>> | undefined
    try {
      directoryHandle = await open(directory, 'r')
      await directoryHandle.sync()
    } catch {
      // Some filesystems do not permit fsync on a directory; the file was synced first.
    } finally {
      await directoryHandle?.close().catch(() => undefined)
    }
  } catch (error) {
    await handle?.close().catch(() => undefined)
    await unlink(temporary).catch(() => undefined)
    throw error
  }
}
