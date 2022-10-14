import { ManagedConnection } from './ManagedConnection'

export interface ManagedConnectionSourceEvent {
    // emitted when new connection has been created, 
    // does not mean that the connection would have been connected
    
    newConnection: (connection: ManagedConnection) => void
}

