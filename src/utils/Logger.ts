import type { CaptureExceptionFn } from '@shared/types/Logging'
import { createLogger } from '@shared/utils/Logging'

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
