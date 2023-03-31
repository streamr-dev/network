import { UUID } from "../helpers/UUID"
import { DisconnectionType } from "../transport/ITransport"

export interface ConnectionEvents {
    data: (bytes: Uint8Array) => void
    connected: () => void
    disconnected: (disconnectionType: DisconnectionType, code?: number, reason?: string) => void 
    error: (name: string) => void
}

export enum ConnectionType {
    WEBSOCKET_SERVER = 'websocket-server',
    WEBSOCKET_CLIENT = 'websocket-client',
    WEBRTC = 'webrtc',
    SIMULATOR_SERVER = 'simulator-server',
    SIMULATOR_CLIENT = 'simulator-client',
}

export type ConnectionIDKey = string & { readonly __brand: 'connectionIDKey' } // Nominal typing 

export class ConnectionID extends UUID {
    toMapKey(): ConnectionIDKey {
        return this.toString() as ConnectionIDKey
    }
}

export interface IConnection {
    
    on(event: 'data', listener: (bytes: Uint8Array) => void): this
    on(event: 'error', listener: (name: string) => void): this
    on(event: 'connected', listener: () => void): this
    on(event: 'disconnected', listener: (disconnectionType: DisconnectionType, code?: number, reason?: string) => void): this
    
    once(event: 'data', listener: (bytes: Uint8Array) => void): this
    once(event: 'error', listener: (name: string) => void): this
    once(event: 'connected', listener: () => void): this
    once(event: 'disconnected', listener: (disconnectionType: DisconnectionType, code?: number, reason?: string) => void): this

    off(event: 'data', listener: (bytes: Uint8Array) => void): void
    off(event: 'error', listener: (name: string) => void): void
    off(event: 'connected', listener: () => void): void
    off(event: 'disconnected', listener: (disconnectionType: DisconnectionType, code?: number, reason?: string) => void): void
    
    send(data: Uint8Array): void
    close(disconnectionType: DisconnectionType): Promise<void>
    destroy(): void
}
