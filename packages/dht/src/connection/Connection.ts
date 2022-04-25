export enum Event {
    DATA = 'streamr:dht:connection:data',
    CONNECTED = 'streamr:dht:connection:connected',
    DISCONNECTED = 'streamr:dht:connection:disconnected',
    ERROR = 'streamr:dht:connection:error'
}

export interface Connection {
    on(event: Event.DATA, listener: (bytes: Uint8Array) => void): this
    on(event: Event.ERROR, listener: (name: string) => void): this
    on(event: Event.CONNECTED, listener: () => void): this
    on(event: Event.DISCONNECTED, listener: (code: number, reason: string) => void): this
    
    send(data: Uint8Array): void
    close(): void
}