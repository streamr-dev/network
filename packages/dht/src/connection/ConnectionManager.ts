import EventEmitter = require("events")

export enum Event {
    RPC_CALL = 'streamr:connection:message-received:rpc-call',
}

export interface ConnectionManager {
    on(event: Event.RPC_CALL, listener: (message: Uint8Array) => void): this
}

export class ConnectionManager extends EventEmitter {
    constructor() {
        super()
    }
}