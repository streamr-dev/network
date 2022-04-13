import { PeerID, TODO } from '../types'
import { RpcWrapper } from '../proto/RpcWrapper'
import EventEmitter = require('events')

export enum Event {
    RESPONSE_RECEIVED = 'streamr:dht:abstract-transport:response-received',
    REQUEST_RECEIVED = 'streamr:dht:abstract-transport:request-received'
}

export interface AbstractTransport {
    on(event: Event.RESPONSE_RECEIVED, listener: (rtcResponse: RpcWrapper) => void): this
    on(event: Event.REQUEST_RECEIVED, listener: (rtcResponse: RpcWrapper) => void): this
}

export abstract class AbstractTransport extends EventEmitter {
    constructor() {
        super()
    }
    abstract send(peerId: PeerID, message: Uint8Array | any): boolean
    abstract request(peerId: PeerID, message: Uint8Array, requestId: string): Promise<RpcWrapper>

    onResponse(response: Uint8Array) {
        const parsed = RpcWrapper.fromBinary(response)
        this.emit(Event.RESPONSE_RECEIVED, parsed)
    }

    onRequest(response: Uint8Array) {
        const parsed = RpcWrapper.fromBinary(response)
        this.emit(Event.REQUEST_RECEIVED, parsed)
    }

    async waitForResponse(requestId: string): Promise<RpcWrapper> {
        let responseHandler: any
        return await new Promise<RpcWrapper>((resolve, reject) => {
            responseHandler = (rtcResponse: RpcWrapper) => {
                if (rtcResponse.requestId === requestId) {
                    resolve(rtcResponse)
                }
            }
            this.on(Event.RESPONSE_RECEIVED, responseHandler)
        }).finally(() => {
            this.off(Event.RESPONSE_RECEIVED, responseHandler)
        })
    }
}