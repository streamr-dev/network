/**
 * WebrtcBridge — runs on the MAIN THREAD.
 *
 * Manages RTCPeerConnection instances on behalf of a worker that cannot
 * access them directly.  Each logical connection is identified by a
 * `connectionId` string supplied by the worker.
 *
 * Signaling (ICE candidates, SDP offers/answers, connection-state changes)
 * is relayed to the worker through Comlink proxy callbacks.
 *
 * Once a DataChannel is created (offerer) or received (answerer) it is
 * **transferred** to the worker so that all data-path events fire inside
 * the worker's event loop — the main thread never touches data traffic.
 */
import * as Comlink from 'comlink'

import { ConnectionInfo } from '../connection/ConnectionDiagnostics'
import { getRtcConnectionInfo } from './rtcConnectionInfo'

// ── Types shared between main-thread bridge and worker client ───────

export interface WebrtcBridgeCallbacks {
    onLocalCandidate(candidate: string, mid: string): void
    onLocalDescription(description: string, type: string): void
    onConnectionStateChange(state: string): void
    /**
     * Called exactly once per connection.  The RTCDataChannel is
     * **transferred** (not cloned) so the worker receives sole ownership.
     */
    onDataChannel(channel: RTCDataChannel): void
}

export interface WebrtcBridgeApi {
    /**
     * Create an RTCPeerConnection on the main thread and wire up
     * signaling events.  If `isOffering` the bridge also creates the
     * DataChannel; otherwise it waits for `ondatachannel`.
     *
     * NOTE: At runtime the `callbacks` parameter is actually a Comlink
     * proxy (Remote<WebrtcBridgeCallbacks>).  We type it as the plain
     * interface so the worker-side call-site types check cleanly when
     * passing `Comlink.proxy(callbacks)`.  The bridge implementation
     * internally casts to the proxied type where needed.
     */
    start(
        connectionId: string,
        iceServers: RTCIceServer[],
        isOffering: boolean,
        callbacks: WebrtcBridgeCallbacks
    ): Promise<void>

    /**
     * Forward a remote SDP to the RTCPeerConnection.
     * Handles perfect-negotiation collision detection internally.
     * @returns `true` if the description was applied, `false` if ignored
     *          (offer collision while this side is the offerer).
     */
    setRemoteDescription(
        connectionId: string,
        description: string,
        type: string
    ): Promise<boolean>

    addRemoteCandidate(
        connectionId: string,
        candidate: string,
        mid: string
    ): Promise<void>

    renameConnection(oldId: string, newId: string): Promise<void>

    /**
     * Selected ICE candidate pair (+ RTT) of the connection's
     * RTCPeerConnection, read on the main thread where the PC lives.
     */
    getConnectionInfo(connectionId: string): Promise<ConnectionInfo | undefined>

    close(connectionId: string): Promise<void>
}

// ── Per-connection state held on the main thread ────────────────────

interface BridgedConnection {
    pc: RTCPeerConnection
    /**
     * At runtime this is a Comlink proxy. We store it typed as
     * the plain interface; actual calls return Promises which
     * we handle via catch-chains.
     */
    callbacks: WebrtcBridgeCallbacks
    isOffering: boolean
    makingOffer: boolean
}

// ── Bridge implementation ───────────────────────────────────────────

export class WebrtcBridge implements WebrtcBridgeApi {

    private readonly connections = new Map<string, BridgedConnection>()

    async start(
        connectionId: string,
        iceServers: RTCIceServer[],
        isOffering: boolean,
        callbacks: WebrtcBridgeCallbacks
    ): Promise<void> {
        const pc = new RTCPeerConnection({ iceServers })

        const conn: BridgedConnection = {
            pc,
            callbacks,
            isOffering,
            makingOffer: false,
        }
        this.connections.set(connectionId, conn)

        // ── ICE candidates ──────────────────────────────────────
        pc.onicecandidate = (event) => {
            if (event.candidate !== null && event.candidate.sdpMid !== null) {
                callbacks.onLocalCandidate(
                    event.candidate.candidate,
                    event.candidate.sdpMid
                )
            }
        }

        // ── Connection state → forwarded to worker ──────────────
        pc.onconnectionstatechange = () => {
            callbacks.onConnectionStateChange(pc.connectionState)
        }

        // ── Offerer path ────────────────────────────────────────
        if (isOffering) {
            pc.onnegotiationneeded = async () => {
                conn.makingOffer = true
                try {
                    await pc.setLocalDescription()
                } catch (_err) {
                    // intentionally swallowed – mirrors DirectWebrtcConnection
                }
                if (pc.localDescription !== null) {
                    callbacks.onLocalDescription(
                        pc.localDescription.sdp,
                        pc.localDescription.type
                    )
                }
                conn.makingOffer = false
            }

            const dc = pc.createDataChannel('streamrDataChannel')
            // Transfer DataChannel ownership to the worker immediately.
            // The worker will attach onopen/onclose/onmessage handlers.
            callbacks.onDataChannel(
                Comlink.transfer(dc, [dc]) as unknown as RTCDataChannel
            )
        } else {
            // ── Answerer path ───────────────────────────────────
            pc.ondatachannel = (event) => {
                callbacks.onDataChannel(
                    Comlink.transfer(event.channel, [event.channel]) as unknown as RTCDataChannel
                )
            }
        }
    }

    async setRemoteDescription(
        connectionId: string,
        description: string,
        type: string
    ): Promise<boolean> {
        const conn = this.connections.get(connectionId)
        if (!conn) {
            return false
        }

        const lowerType = type.toLowerCase() as RTCSdpType

        // Perfect-negotiation collision detection
        const offerCollision =
            lowerType === 'offer' &&
            (conn.makingOffer || conn.pc.signalingState !== 'stable')
        if (conn.isOffering && offerCollision) {
            return false
        }

        try {
            await conn.pc.setRemoteDescription({ sdp: description, type: lowerType })
        } catch (_err) {
            return false
        }

        // If we received an offer, create an answer
        if (lowerType === 'offer') {
            try {
                await conn.pc.setLocalDescription()
            } catch (_err) {
                // intentionally swallowed
            }
            if (conn.pc.localDescription !== null) {
                conn.callbacks.onLocalDescription(
                    conn.pc.localDescription.sdp,
                    conn.pc.localDescription.type
                )
            }
        }
        return true
    }

    async addRemoteCandidate(
        connectionId: string,
        candidate: string,
        mid: string
    ): Promise<void> {
        const conn = this.connections.get(connectionId)
        if (!conn) {
            return
        }
        try {
            await conn.pc.addIceCandidate({ candidate, sdpMid: mid })
        } catch (_err) {
            // intentionally swallowed
        }
    }

    async renameConnection(oldId: string, newId: string): Promise<void> {
        const conn = this.connections.get(oldId)
        if (conn) {
            this.connections.delete(oldId)
            this.connections.set(newId, conn)
        }
    }

    async getConnectionInfo(connectionId: string): Promise<ConnectionInfo | undefined> {
        const conn = this.connections.get(connectionId)
        if (!conn) {
            return undefined
        }
        return getRtcConnectionInfo(conn.pc)
    }

    async close(connectionId: string): Promise<void> {
        const conn = this.connections.get(connectionId)
        if (!conn) {
            return
        }
        this.connections.delete(connectionId)

        // Tear down event handlers
        conn.pc.onicecandidate = null
        conn.pc.onconnectionstatechange = null
        conn.pc.onnegotiationneeded = null
        conn.pc.ondatachannel = null

        try {
            conn.pc.close()
        } catch (_err) {
            // intentionally swallowed
        }
    }
}
