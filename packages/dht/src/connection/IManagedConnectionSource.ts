import { ManagedConnection } from './ManagedConnection'

export interface ManagedConnectionSourceEvent {
    newConnection: (connection: ManagedConnection) => void
}

