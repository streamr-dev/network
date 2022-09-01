import { ManagedConnection } from './ManagedConnection'

export interface ManagedConnectionSourceEvent {
    CONNECTED: (connection: ManagedConnection) => void
}

