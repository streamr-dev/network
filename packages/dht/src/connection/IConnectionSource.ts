import { IConnection } from './IConnection'

export enum Event {
    CONNECTED = 'streamr:dht:connectionsource:connected'
}

export interface IConnectionSource {
    on(event: Event.CONNECTED, listener: (connection: IConnection) => void): this
    once(event: Event.CONNECTED, listener: (connection: IConnection) => void): this
}