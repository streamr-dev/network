import { Connection } from './Connection'

export enum Event {
    NEW_CONNECTION = 'streamr:dht:connectionsource:new_connection',
}

export interface ConnectionSource {
    on(event: Event.NEW_CONNECTION, listener: (connection: Connection) => void): this
}