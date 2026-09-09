interface GapDiagnosticEvent {
    layer: string
    timestampMs: number
    deltaMs?: number
    detail?: Record<string, unknown>
}

let enabled = true

export function setGapDiagnosticsEnabled(val: boolean): void {
    enabled = val
    ;(globalThis as any).__dhtGapDiagEnabled = val
}

export function isGapDiagnosticsEnabled(): boolean {
    return enabled
}

const SUMMARY_INTERVAL_MS = 2000

interface LayerAccumulator {
    count: number
    sumDeltaMs: number
    maxDeltaMs: number
    outlierCount: number
    lastReportMs: number
    lastEventMs: number
}

const accumulators = new Map<string, LayerAccumulator>()

export function logGapDiagnosticSampled(
    layer: string,
    opts: { detail?: Record<string, unknown>, outlierThresholdMs?: number } = {},
): void {
    if (!enabled && !(globalThis as any).__dhtGapDiagEnabled) {return}
    const now = performance.now()
    const threshold = opts.outlierThresholdMs ?? 30

    let acc = accumulators.get(layer)
    if (acc === undefined) {
        acc = { count: 0, sumDeltaMs: 0, maxDeltaMs: 0, outlierCount: 0, lastReportMs: now, lastEventMs: now }
        accumulators.set(layer, acc)
        return
    }

    const deltaMs = now - acc.lastEventMs
    acc.lastEventMs = now
    acc.count++
    if (deltaMs > acc.maxDeltaMs) {acc.maxDeltaMs = deltaMs}
    acc.sumDeltaMs += deltaMs
    if (deltaMs > threshold) {acc.outlierCount++}

    if (deltaMs > threshold) {
        const payload: GapDiagnosticEvent = {
            layer,
            timestampMs: now,
            deltaMs: +deltaMs.toFixed(2),
            detail: opts.detail,
        }
        // eslint-disable-next-line no-console
        console.log('[gap-diagnostics]', JSON.stringify(payload))
    }

    if (now - acc.lastReportMs >= SUMMARY_INTERVAL_MS) {
        const summaryDetail = {
            count: acc.count,
            meanDeltaMs: acc.count > 0 ? +(acc.sumDeltaMs / acc.count).toFixed(2) : 0,
            maxDeltaMs: +acc.maxDeltaMs.toFixed(2),
            outlierCount: acc.outlierCount,
            periodMs: +(now - acc.lastReportMs).toFixed(1),
        }
        const summary: GapDiagnosticEvent = {
            layer: `${layer}.summary`,
            timestampMs: now,
            detail: summaryDetail,
        }
        // eslint-disable-next-line no-console
        console.log('[gap-diagnostics]', JSON.stringify(summary))
        acc.count = 0
        acc.sumDeltaMs = 0
        acc.maxDeltaMs = 0
        acc.outlierCount = 0
        acc.lastReportMs = now
    }
}

// Per-event diagnostic line (rate-limited per layer) for rare/structural
// events where the individual values matter.
const eventBudget = new Map<string, { windowStart: number, n: number }>()
export function logGapDiagnosticEvent(
    layer: string,
    detail: Record<string, unknown>,
    maxPerSecond = 20
): void {
    if (!isGapDiagnosticsEnabled()) {
        return
    }
    const now = performance.now()
    let b = eventBudget.get(layer)
    if (b === undefined || now - b.windowStart >= 1000) {
        b = { windowStart: now, n: 0 }
        eventBudget.set(layer, b)
    }
    b.n++
    if (b.n > maxPerSecond) {
        return
    }
    // eslint-disable-next-line no-console
    console.log('[gap-diagnostics]', JSON.stringify({ layer, timestampMs: now, detail }))
}
