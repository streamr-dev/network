import { IDhtRpcServiceClient } from '../proto/packages/dht/protos/DhtRpc.client'
import {
    ClosestPeersRequest,
    LeaveNotice,
    PeerDescriptor,
    PingRequest
} from '../proto/packages/dht/protos/DhtRpc'
import { v4 } from 'uuid'
import { Logger } from '@streamr/utils'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { Remote } from './contact/Remote'
import { PeerID } from '../helpers/PeerID'
import { peerIdFromPeerDescriptor } from '../helpers/peerIdFromPeerDescriptor'

const logger = new Logger(module)

// Fields required by objects stored in the k-bucket library
export interface KBucketContact {
    id: Uint8Array
    vectorClock: number
}

export class DhtPeer extends Remote<IDhtRpcServiceClient> implements KBucketContact {

    private static counter = 0
    public vectorClock: number
    public readonly id: Uint8Array

    constructor(
        ownPeerDescriptor: PeerDescriptor,
        peerDescriptor: PeerDescriptor,
        client: ProtoRpcClient<IDhtRpcServiceClient>,
        serviceId: string
    ) {
        super(ownPeerDescriptor, peerDescriptor, serviceId, client)
        this.id = this.getPeerId().value
        this.vectorClock = DhtPeer.counter++
    }

    async getClosestPeers(kademliaId: Uint8Array): Promise<PeerDescriptor[]> {
        logger.trace(`Requesting getClosestPeers on ${this.getServiceId()} from ${this.getPeerId().toKey()}`)
        const request: ClosestPeersRequest = {
            kademliaId,
            requestId: v4()
        }
        try {
            const peers = await this.getClient().getClosestPeers(request, this.formDhtRpcOptions())
            return peers.peers
        } catch (err) {
            logger.trace(`getClosestPeers error ${this.getServiceId()}`, { err })
            throw err
        }
    }

    async ping(): Promise<boolean> {
        logger.trace(`Requesting ping on ${this.getServiceId()} from ${this.getPeerId().toKey()}`)
        const request: PingRequest = {
            requestId: v4()
        }
        const options = this.formDhtRpcOptions({
            timeout: 10000
        })
        try {
            const pong = await this.getClient().ping(request, options)
            if (pong.requestId === request.requestId) {
                return true
            }
        } catch (err) {
            logger.trace(`ping failed on ${this.getServiceId()} to ${this.getPeerId().toKey()}: ${err}`)
        }
        return false
    }

    leaveNotice(): void {
        logger.trace(`Sending leaveNotice on ${this.getServiceId()} from ${this.getPeerId().toKey()}`)
        const request: LeaveNotice = {
            serviceId: this.getServiceId()
        }
        const options = this.formDhtRpcOptions({
            notification: true
        })
        this.getClient().leaveNotice(request, options).catch((e) => {
            logger.trace('Failed to send leaveNotice' + e)
        })
    }

    getPeerId(): PeerID {
        return peerIdFromPeerDescriptor(this.getPeerDescriptor())
    }
}
