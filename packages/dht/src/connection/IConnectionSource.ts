import { IConnection } from './IConnection'

export interface ConnectionSourceEvents {
    connected: ((connection: IConnection) => void) 
}

