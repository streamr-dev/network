import { UUID } from "../helpers/UUID"

export interface ConnectionEvent {
    DATA: (bytes: Uint8Array) => void
    CONNECTED: () => void
    DISCONNECTED: (code?: number, reason?: string) => void 
    ERROR: (name: string) => void
}

export enum ConnectionType {
    WEBSOCKET_SERVER = 'websocket-server',
    WEBSOCKET_CLIENT = 'websocket-client',
    DEFERRED = 'deferred',
    WEBRTC = 'webrtc',
}

export type ConnectionIDKey = string & { readonly __brand: 'connectionIDKey' } // Nominal typing 

export class ConnectionID extends UUID {
    toMapKey(): ConnectionIDKey {
        return this.toString() as ConnectionIDKey
    }
}

export interface IConnection {
    
    on(event: 'DATA', listener: (bytes: Uint8Array) => void): this
    on(event: 'ERROR', listener: (name: string) => void): this
    on(event: 'CONNECTED', listener: () => void): this
    on(event: 'DISCONNECTED', listener: (code?: number, reason?: string) => void): this
    
    once(event: 'DATA', listener: (bytes: Uint8Array) => void): this
    once(event: 'ERROR', listener: (name: string) => void): this
    once(event: 'CONNECTED', listener: () => void): this
    once(event: 'DISCONNECTED', listener: (code?: number, reason?: string) => void): this

    off(event: 'DATA', listener: (bytes: Uint8Array) => void): void
    off(event: 'ERROR', listener: (name: string) => void): void
    off(event: 'CONNECTED', listener: () => void): void
    off(event: 'DISCONNECTED', listener: (code?: number, reason?: string) => void): void
    
    send(data: Uint8Array): void
    close(): void
}
