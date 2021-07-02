import { ConstructorOptions, WebSocketConnection } from "./WebSocketConnection"

export abstract class ClientWebSocketConnection extends WebSocketConnection {
    protected constructor(opts: ConstructorOptions) {
        super(opts)
    }
	
    connect(): void {
        if (this.isFinished) {
            throw new Error('Connection already closed.')
        }
        this.doConnect()
    }
	abstract doConnect(): void
}