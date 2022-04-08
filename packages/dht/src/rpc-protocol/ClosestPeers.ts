import EventEmitter = require('events')
import { ClosestPeersRequest, ClosestPeersResponse} from '../proto/ClosestPeers'
import { v4 } from 'uuid'
import { ITransport } from '../transport/ITransport'
import { PeerID } from '../types'

export class ClosestPeers extends EventEmitter {
    private readonly transport: ITransport
    constructor(transport: ITransport) {
        super()
        this.transport = transport
    }

    requestClosestPeers(peerId: PeerID, neighborId: PeerID) {
        const nonce = v4()
        const request: ClosestPeersRequest = {
            peerId,
            nonce
        }
        const bytes = ClosestPeersRequest.toBinary(request)
        this.transport.send(peerId, bytes)
    }

    // onClosestPeersRequest()
}
