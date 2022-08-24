import { ManagedConnection } from './ManagedConnection'

export enum Event {
    CONNECTED = 'streamr:dht:managedconnectionsource:connected'
}

export interface IManagedConnectionSource {
    on(event: Event.CONNECTED, listener: (connection: ManagedConnection) => void): this
    once(event: Event.CONNECTED, listener: (connection: ManagedConnection) => void): this
}
