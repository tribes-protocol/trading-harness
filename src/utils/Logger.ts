import type { CaptureExceptionFn } from '@/types/Logging'
import { createLogger } from '@/utils/Logging'

let captureExceptionFn: CaptureExceptionFn | null = null

export function configureFoundationLogger(captureException: CaptureExceptionFn): void {
  captureExceptionFn = captureException
}

export const logger = createLogger({
  name: 'foundation',
  captureException(error, context) {
    captureExceptionFn?.(error, context)
  }
})
