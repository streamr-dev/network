import { IConnection } from './IConnection'

export interface ConnectionSourceEvent {
    CONNECTED: ((connection: IConnection) => void) 
}

