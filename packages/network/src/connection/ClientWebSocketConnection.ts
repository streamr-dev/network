import { ConstructorOptions, WebSocketConnection } from "./WebSocketConnection"
import { Logger } from "../helpers/Logger"
import { NameDirectory } from "../NameDirectory"

export abstract class ClientWebSocketConnection extends WebSocketConnection {
    //private _logger: Logger

    constructor(opts: ConstructorOptions) {
        super(opts)
        //this._logger = new Logger(module, `${NameDirectory.getName(this.getPeerId())}/${this.id}`)
    }
	
    connect(): void {
        if (this.isFinished) {
            throw new Error('Connection already closed.')
        }
        this.doConnect()
        /*
		this.connectionTimeoutRef = setTimeout(() => {
            if (this.isFinished) { return }
            this.logger.warn(`connection timed out after ${this.newConnectionTimeout}ms`)
            this.close(new Error(`timed out after ${this.newConnectionTimeout}ms`))
        }, this.newConnectionTimeout)
		*/
    }
	abstract doConnect(): void
}