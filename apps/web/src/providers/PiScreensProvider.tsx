'use client'

import { type ClientFrame, ServerFrameSchema } from '@tribes-harness/protocol/types/ScreenProtocol'
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState
} from 'react'

import { GATEWAY_WS_URL } from '@/common/Env'
import {
  RECONNECT_BASE_DELAY_MS,
  RECONNECT_JITTER_RATIO,
  RECONNECT_MAX_DELAY_MS
} from '@/common/Gateway'
import type {
  GatewayStatus,
  PiScreensContextValue,
  ScreenLoadPhase,
  ScreenViewState
} from '@/types/ScreenView'
import { serializeClientFrame } from '@/utils/ClientFrameCodec'
import { logError, logWarn } from '@/utils/Logger'
import { INITIAL_SCREENS_STATE, reduceScreens } from '@/utils/ScreenState'

/**
 * Owns the ONE gateway WebSocket for the whole tab. Screens are multiplexed over it
 * by `screenId`, so adding screens never adds sockets.
 *
 * Everything the socket touches lives in the single mount effect below: the socket,
 * the retry timer and the attempt counter are plain locals in that closure, which is
 * why none of them need refs. React state carries only what the tree renders.
 */

const PiScreensContext = createContext<PiScreensContextValue | null>(null)

interface PiScreensProviderProps {
  children: ReactNode
}

export function PiScreensProvider({ children }: PiScreensProviderProps): ReactNode {
  const [screensState, dispatch] = useReducer(reduceScreens, INITIAL_SCREENS_STATE)
  const [status, setStatus] = useState<GatewayStatus>('connecting')
  const [socket, setSocket] = useState<WebSocket | null>(null)
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null)

  const { screenOrder, screens, protocolMismatch } = screensState

  // Read only from inside the attach effect, which must NOT re-run when a delta
  // changes a screen's blocks — a fresh cursor per keystroke of agent output would
  // turn every token into a re-attach.
  const leafEntryIdsRef = useRef<Record<string, string | null>>({})
  const leafEntryIds: Record<string, string | null> = {}
  for (const screenId of screenOrder) {
    leafEntryIds[screenId] = screens[screenId]?.leafEntryId ?? null
  }
  leafEntryIdsRef.current = leafEntryIds

  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let live: WebSocket | null = null
    let attempt = 0
    let disposed = false

    const open = (): void => {
      const next = new WebSocket(GATEWAY_WS_URL)
      live = next

      next.onopen = (): void => {
        attempt = 0
        setStatus('open')
        setSocket(next)
      }

      next.onmessage = (event: MessageEvent): void => {
        if (typeof event.data !== 'string') {
          return
        }
        let raw: unknown
        try {
          raw = JSON.parse(event.data)
        } catch {
          logWarn('gateway: dropped a frame that is not JSON')
          return
        }
        const parsed = ServerFrameSchema.safeParse(raw)
        if (!parsed.success) {
          logWarn('gateway: dropped a frame that does not match ServerFrameSchema')
          return
        }
        dispatch({ type: 'frame', frame: parsed.data })
      }

      next.onerror = (): void => {
        logError(`gateway: socket error on ${GATEWAY_WS_URL}`)
      }

      next.onclose = (): void => {
        // Clear the slot only if THIS socket still owns it. Under StrictMode's
        // double-invoke (and Fast Refresh) the first effect's socket closes after
        // the second effect's socket is already open and stored; an unconditional
        // reset would wipe the live socket, and `sendFrame` would then silently
        // drop every frame — attach included — leaving the tab connected and
        // permanently blank.
        setSocket((current) => (current === next ? null : current))
        if (disposed) {
          return
        }
        setStatus('reconnecting')
        const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** attempt)
        attempt += 1
        retryTimer = setTimeout(open, delay + Math.random() * delay * RECONNECT_JITTER_RATIO)
      }
    }

    open()

    return (): void => {
      disposed = true
      if (retryTimer !== null) {
        clearTimeout(retryTimer)
      }
      live?.close()
    }
  }, [])

  // The single outbound choke point. Refusing on a version mismatch belongs HERE
  // rather than at the attach call site: the socket is still open on a mismatch, so
  // a guard that only covered `attach` would leave `prompt` and `abort` writing to a
  // gateway whose wire shape this build has already admitted it cannot read.
  const sendFrame = useCallback(
    (frame: ClientFrame): void => {
      if (protocolMismatch || socket === null || socket.readyState !== WebSocket.OPEN) {
        return
      }
      socket.send(serializeClientFrame(frame))
    },
    [protocolMismatch, socket]
  )

  // One entry per screen, carrying its monotonic gap count. As an effect dependency
  // this changes on exactly two events — the screen list changed, or a `seq` gap was
  // detected — and never when a delta lands.
  const attachKey = screenOrder
    .map((screenId) => `${screenId}:${screens[screenId]?.resyncCount ?? 0}`)
    .join('|')

  useEffect(() => {
    if (attachKey.length === 0) {
      return
    }
    for (const screenId of screenOrder) {
      sendFrame({
        t: 'attach',
        screenId,
        sinceEntryId: leafEntryIdsRef.current[screenId] ?? null
      })
    }
  }, [attachKey, screenOrder, sendFrame])

  const orderedScreens = useMemo(
    () =>
      screenOrder.flatMap((screenId) => {
        const screen = screens[screenId]
        return screen === undefined ? [] : [screen]
      }),
    [screenOrder, screens]
  )

  const activeScreenId =
    selectedScreenId !== null && screens[selectedScreenId] !== undefined
      ? selectedScreenId
      : (screenOrder[0] ?? null)
  const activeScreen: ScreenViewState | null =
    activeScreenId === null ? null : (screens[activeScreenId] ?? null)
  const activeStatus = activeScreen?.state.status ?? null

  const selectScreen = useCallback((screenId: string): void => {
    setSelectedScreenId(screenId)
  }, [])

  const sendPrompt = useCallback(
    (text: string): void => {
      const trimmed = text.trim()
      if (activeScreenId === null || trimmed.length === 0) {
        return
      }
      // Pi rejects a prompt sent mid-stream without a behavior. `steer` lands after
      // the current turn's tool calls, which is what a human correcting the agent
      // means; `null` is "only send if idle".
      sendFrame({
        t: 'prompt',
        screenId: activeScreenId,
        text: trimmed,
        streamingBehavior: activeStatus === 'streaming' ? 'steer' : null
      })
      dispatch({ type: 'prompt', screenId: activeScreenId, text: trimmed })
    },
    [activeScreenId, activeStatus, sendFrame]
  )

  const abort = useCallback((): void => {
    if (activeScreenId === null) {
      return
    }
    sendFrame({ t: 'abort', screenId: activeScreenId })
  }, [activeScreenId, sendFrame])

  const loadPhase: ScreenLoadPhase = protocolMismatch
    ? 'error'
    : activeScreen?.hydrated === true
      ? 'loaded'
      : 'connecting'

  const value = useMemo(
    (): PiScreensContextValue => ({
      status,
      loadPhase,
      protocolMismatch,
      screens: orderedScreens,
      activeScreen,
      selectScreen,
      sendPrompt,
      abort
    }),
    [
      status,
      loadPhase,
      protocolMismatch,
      orderedScreens,
      activeScreen,
      selectScreen,
      sendPrompt,
      abort
    ]
  )

  return <PiScreensContext.Provider value={value}>{children}</PiScreensContext.Provider>
}

export function usePiScreens(): PiScreensContextValue {
  const value = useContext(PiScreensContext)
  if (value === null) {
    throw new Error('usePiScreens must be used inside <PiScreensProvider>')
  }
  return value
}
