import { BrandedString } from '@streamr/utils'

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
    SIMULATOR_CLIENT = 'simulator-client'
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

    send(data: Uint8Array): void
    close(gracefulLeave: boolean): Promise<void>
    destroy(): void
}
