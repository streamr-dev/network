/**
 * Conditional re-export of the browser WebrtcConnection.
 *
 * At module-load time we detect whether we are running inside a Web Worker.
 * - **Main thread** → use {@link DirectWebrtcConnection} which owns the
 *   `RTCPeerConnection` and `RTCDataChannel` directly.
 * - **Worker thread** → use {@link WorkerWebrtcConnection} which delegates
 *   `RTCPeerConnection` signaling to the main thread via a Comlink bridge
 *   and receives a transferred `RTCDataChannel` that lives entirely in the
 *   worker.
 *
 * Both classes implement `IWebrtcConnection & IConnection` and expose the
 * same public API, so upstream code (WebrtcConnector, etc.) is unaffected.
 */
import { isWorkerEnvironment } from './isWorkerEnvironment'
import { DirectWebrtcConnection } from './DirectWebrtcConnection'
import { WorkerWebrtcConnection } from './WorkerWebrtcConnection'
import type { WebrtcConnectionParams } from '../types/WebrtcConnectionParams'

// The canonical instance type (used in type annotations such as
// `connection: WebrtcConnection` in WebrtcConnector / ConnectingConnection).
export type WebrtcConnection = DirectWebrtcConnection

// The constructor — points to the right class based on the runtime
// environment.  The type assertion is safe because both implementations
// share the same public interface surface.
export const WebrtcConnection: new (params: WebrtcConnectionParams) => WebrtcConnection = (
    isWorkerEnvironment
        ? WorkerWebrtcConnection
        : DirectWebrtcConnection
) as unknown as new (params: WebrtcConnectionParams) => WebrtcConnection
