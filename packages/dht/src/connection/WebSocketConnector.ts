import { EventEmitter } from 'events'
import { ConnectionSource, Event as ConnectionSourceEvent } from './ConnectionSource'
import { ClientWebSocket } from './ClientWebSocket'
import { Event as ConnectionEvent} from './Connection'

export class WebSocketConnector extends EventEmitter implements ConnectionSource{
    connect(address: string): void {
        const socket = new ClientWebSocket()
        
        socket.on(ConnectionEvent.CONNECTED, () => {
            this.emit(ConnectionSourceEvent.NEW_CONNECTION, socket)
        })

        socket.connect(address)
    }
}
