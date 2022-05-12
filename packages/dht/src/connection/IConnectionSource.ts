import { Connection } from './Connection'

export enum Event {
    CONNECTED = 'streamr:dht:connectionsource:connected'
}

export interface IConnectionSource {
    on(event: Event.CONNECTED, listener: (connection: Connection) => void): this
    once(event: Event.CONNECTED, listener: (connection: Connection) => void): this
}