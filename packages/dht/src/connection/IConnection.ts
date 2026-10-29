import { BrandedString } from '@streamr/utils'
import { ConnectionInfo } from './ConnectionDiagnostics'
import { SendQueueStatistics, SendQueueHint } from './ConnectionStatistics'

export interface ConnectionEvents {
    data: (bytes: Uint8Array) => void
    connected: () => void
    disconnected: (gracefulLeave: boolean, code?: number, reason?: string) => void 
    error: (name: string) => void
}

export enum ConnectionType {
    WEBSOCKET_SERVER = 'websocket-server',
    WEBSOCKET_CLIENT = 'websocket-client',
    WEBRTC = 'webrtc',
    SIMULATOR_SERVER = 'simulator-server',
    SIMULATOR_CLIENT = 'simulator-client',
}

export type ConnectionID = BrandedString<'ConnectionID'>

export interface IConnection {
    
    on(event: 'data', listener: (bytes: Uint8Array) => void): this
    on(event: 'error', listener: (name: string) => void): this
    on(event: 'connected', listener: () => void): this
    on(event: 'disconnected', listener: (gracefulLeave: boolean, code?: number, reason?: string) => void): this
    
    once(event: 'data', listener: (bytes: Uint8Array) => void): this
    once(event: 'error', listener: (name: string) => void): this
    once(event: 'connected', listener: () => void): this
    once(event: 'disconnected', listener: (gracefulLeave: boolean, code?: number, reason?: string) => void): this

    off(event: 'data', listener: (bytes: Uint8Array) => void): void
    off(event: 'error', listener: (name: string) => void): void
    off(event: 'connected', listener: () => void): void
    off(event: 'disconnected', listener: (gracefulLeave: boolean, code?: number, reason?: string) => void): void
    
    /** `hint` only matters to connections with a send queue (WebRTC) */
    send(data: Uint8Array, hint?: SendQueueHint): void
    /** withdraw the queued messages sent under `purgeKey`; returns how many */
    purgeSendQueue?(purgeKey: string): number
    close(gracefulLeave: boolean): Promise<void>
    destroy(): void

    readonly connectionType?: ConnectionType
    /**
     * Optional transport-specific diagnostics (selected ICE candidate pair,
     * websocket url, ...) used for the `[conn-type]` connection logging.
     * Must resolve quickly and never throw.
     */
    getConnectionInfo?(): Promise<ConnectionInfo | undefined>
    /**
     * Synchronous send-side statistics snapshot for transports that can
     * provide one (WebRTC datachannels, websockets). Cheap, never throws;
     * returns undefined once the connection is closed.
     */
    getStatistics?(): SendQueueStatistics | undefined
    /**
     * Transport features this end advertises in the handshake (e.g. the
     * WebRTC media channel). Undefined/empty for transports without any.
     */
    getLocalCapabilities?(): string[]
    /**
     * The features the remote end advertised in its handshake message; the
     * Handshaker calls this before completing the handshake.
     */
    setRemoteCapabilities?(capabilities: string[]): void
}
