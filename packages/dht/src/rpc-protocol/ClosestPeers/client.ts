import EventEmitter = require('events')
import { ClosestPeersRequest, ClosestPeersResponse, Neighbor } from '../../proto/ClosestPeers'
import { v4 } from 'uuid'
import { AbstractTransport } from '../../transport/AbstractTransport'
import { PeerID } from '../../types'

export enum Event {
    RESPONSE_RECEIVED = 'streamr:dht:getClosestPeers:response'
}

export interface ClosestPeersClient {
    on(event: Event.RESPONSE_RECEIVED, listener: (neighbors: Neighbor[]) => void): this
}

export class ClosestPeersClient extends EventEmitter {
    private readonly transport: AbstractTransport
    constructor(transport: AbstractTransport) {
        super()
        this.transport = transport
    }

    getClosestPeers(peerId: PeerID, neighborId: PeerID): void {
        const nonce = v4()
        const request: ClosestPeersRequest = {
            peerId,
            nonce
        }
        const bytes = ClosestPeersRequest.toBinary(request)
        this.transport.send(neighborId, bytes)
    }

    onGetClosestPeersResponse(response: Uint8Array): void {
        console.info('ClosestPeersClient: onResponse')
        const { neighbors } = ClosestPeersResponse.fromBinary(response)
        this.emit(Event.RESPONSE_RECEIVED, neighbors)
    }
}
