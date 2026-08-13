import { ConnectionInfo } from '../connection/ConnectionDiagnostics'

/**
 * Reads the selected ICE candidate pair of a browser RTCPeerConnection.
 *
 * Primary source is RTCIceTransport.getSelectedCandidatePair() — a
 * synchronous, spec-defined read that is necessarily populated once the
 * datachannel is open, so it cannot race the 'connected' event. A single
 * getStats() call enriches the result with the pair RTT and acts as the
 * fallback pair source on browsers that lack the RTCIceTransport API;
 * it is never retried.
 */
export async function getRtcConnectionInfo(pc: RTCPeerConnection): Promise<ConnectionInfo | undefined> {
    const info: ConnectionInfo = {}
    try {
        const iceTransport = pc.sctp?.transport?.iceTransport
        const pair = iceTransport?.getSelectedCandidatePair?.()
        if ((pair?.local != null) && (pair.remote != null)) {
            info.local = formatCandidate(pair.local.type, pair.local.protocol)
            info.remote = formatCandidate(pair.remote.type, pair.remote.protocol)
            if ((pair.local.type === 'relay') && (pair.local.address != null)) {
                info.relayAddr = `${pair.local.address}:${pair.local.port}`
            }
        }
    } catch {
        // fall through to stats
    }
    try {
        const report = await pc.getStats()
        enrichFromStats(report, info)
    } catch {
        // stats unavailable — return whatever the ice transport gave us
    }
    return (info.local !== undefined || info.rttMs !== undefined) ? info : undefined
}

function formatCandidate(type: string | null | undefined, protocol: string | null | undefined): string {
    return `${type ?? '?'}/${protocol ?? '?'}`
}

function enrichFromStats(report: RTCStatsReport, info: ConnectionInfo): void {
    const pairs = new Map<string, Record<string, unknown>>()
    const candidates = new Map<string, Record<string, unknown>>()
    let selectedPairId: string | undefined
    report.forEach((stat: Record<string, unknown>) => {
        if ((stat.type === 'transport') && (typeof stat.selectedCandidatePairId === 'string')) {
            selectedPairId = stat.selectedCandidatePairId
        } else if (stat.type === 'candidate-pair') {
            pairs.set(stat.id as string, stat)
        } else if ((stat.type === 'local-candidate') || (stat.type === 'remote-candidate')) {
            candidates.set(stat.id as string, stat)
        }
    })
    let selectedPair = (selectedPairId !== undefined) ? pairs.get(selectedPairId) : undefined
    if (selectedPair === undefined) {
        for (const pair of pairs.values()) {
            if ((pair.nominated === true) && (pair.state === 'succeeded')) {
                selectedPair = pair
                break
            }
        }
    }
    if (selectedPair === undefined) {
        return
    }
    if (typeof selectedPair.currentRoundTripTime === 'number') {
        info.rttMs = Math.round(selectedPair.currentRoundTripTime * 1000)
    }
    if (info.local === undefined) {
        const local = candidates.get(selectedPair.localCandidateId as string)
        const remote = candidates.get(selectedPair.remoteCandidateId as string)
        if (local !== undefined) {
            info.local = formatCandidate(local.candidateType as string, local.protocol as string)
            if ((local.candidateType === 'relay') && (typeof local.address === 'string')) {
                info.relayAddr = `${local.address}:${local.port}`
            }
        }
        if (remote !== undefined) {
            info.remote = formatCandidate(remote.candidateType as string, remote.protocol as string)
        }
    }
}
