/**
 * Always-on, low-volume connection-type diagnostics. One console line per
 * connection lifecycle event, JSON-stringified so the payload survives in
 * copy-pasted console logs (pino's browser mode logs objects, which collapse
 * to "Object" when a user saves the console).
 *
 * The motivating case: on CGNAT networks every WebRTC connection silently
 * falls back to TURN relays and nothing in the logs shows it. A line like
 *   [conn-type] {"ev":"connected","type":"webrtc","local":"relay/udp",...}
 * makes the transport path visible in any pasted log.
 */

export interface ConnectionInfo {
    /** "candidateType/protocol", e.g. "relay/udp" */
    local?: string
    /** "candidateType/protocol", e.g. "srflx/udp" */
    remote?: string
    /** "address:port" of the local relay candidate (TURN server), relay only */
    relayAddr?: string
    /** selected-pair round-trip time in milliseconds */
    rttMs?: number
    /** target url of an outgoing websocket connection */
    url?: string
    /** remote address of an incoming websocket connection */
    remoteAddress?: string
    /** milliseconds from connection construction to this event */
    ms?: number
}

let enabled = true

export function setConnectionDiagnosticsEnabled(val: boolean): void {
    enabled = val
}

export function isConnectionDiagnosticsEnabled(): boolean {
    return enabled
}

export function logConnectionEvent(payload: Record<string, unknown>): void {
    if (!enabled) {
        return
    }
    try {
        // eslint-disable-next-line no-console
        console.log('[conn-type]', JSON.stringify(payload))
    } catch {
        // never let diagnostics interfere with connectivity
    }
}

/**
 * High-churn events (the DHT opens and closes many short-lived websocket
 * connections, easily 100+ per minute during discovery) are aggregated into
 * one summary line per minute instead of being logged individually.
 */
const SUMMARY_INTERVAL_MS = 60 * 1000

const summaryCounts = new Map<string, number>()
let summaryTimer: ReturnType<typeof setInterval> | undefined

export function recordSummarizedConnectionEvent(kind: string): void {
    if (!enabled) {
        return
    }
    summaryCounts.set(kind, (summaryCounts.get(kind) ?? 0) + 1)
    if (summaryTimer === undefined) {
        summaryTimer = setInterval(flushSummary, SUMMARY_INTERVAL_MS)
        // don't keep node processes alive because of the summary timer
        ;(summaryTimer as { unref?: () => void }).unref?.()
    }
}

function flushSummary(): void {
    if (summaryCounts.size === 0) {
        return
    }
    const counts: Record<string, number> = {}
    for (const [kind, count] of summaryCounts) {
        counts[kind] = count
    }
    summaryCounts.clear()
    logConnectionEvent({ ev: 'summary', windowMs: SUMMARY_INTERVAL_MS, counts })
}
