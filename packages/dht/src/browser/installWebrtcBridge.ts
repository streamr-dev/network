/**
 * Call this function on the **main thread** before the worker starts using
 * WebRTC connections.  It creates a dedicated `MessageChannel`, exposes a
 * {@link WebrtcBridge} instance on one port, and sends the other port to
 * the worker so that `WorkerWebrtcConnection` can reach the bridge.
 *
 * @example
 * ```ts
 * import { installWebrtcBridge } from '@streamr/dht'
 *
 * const worker = new Worker('./my-worker.ts', { type: 'module' })
 * installWebrtcBridge(worker)
 * ```
 */
import * as Comlink from 'comlink'
import { WebrtcBridge } from './WebrtcBridge'

export const WEBRTC_BRIDGE_PORT_MESSAGE_TYPE = 'streamr-webrtc-bridge-port'

export function installWebrtcBridge(worker: Worker): void {
    const bridge = new WebrtcBridge()
    const channel = new MessageChannel()

    // Expose the bridge API on port1 — the worker will Comlink.wrap(port2).
    Comlink.expose(bridge, channel.port1)

    // Send port2 to the worker.  It is transferred (not cloned).
    worker.postMessage(
        { type: WEBRTC_BRIDGE_PORT_MESSAGE_TYPE, port: channel.port2 },
        [channel.port2]
    )
}
