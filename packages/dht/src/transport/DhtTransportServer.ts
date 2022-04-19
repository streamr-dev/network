import { RpcWrapper } from '../proto/DhtRpc'
import EventEmitter = require('events')

export enum Event {
    RPC_RESPONSE= 'streamr:dht-transport:response-new'
}

export interface DhtTransportServer {
    on(event: Event.RPC_RESPONSE, listener: (rpcWrapper: RpcWrapper) => void): this
}

export class DhtTransportServer extends EventEmitter {
    constructor() {
        super()
    }
}