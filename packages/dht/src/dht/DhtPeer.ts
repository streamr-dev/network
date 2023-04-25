import { IDhtRpcServiceClient } from '../proto/packages/dht/protos/DhtRpc.client'
import {
    ClosestPeersRequest,
    LeaveNotice,
    PeerDescriptor,
    PingRequest
} from '../proto/packages/dht/protos/DhtRpc'
import { v4 } from 'uuid'
import { DhtRpcOptions } from '../rpc-protocol/DhtRpcOptions'
import { Logger } from '@streamr/utils'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { Remote } from './contact/Remote'

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
        super(ownPeerDescriptor, peerDescriptor, client, serviceId)
        this.id = this.peerId.value
        this.vectorClock = DhtPeer.counter++
    }

    async getClosestPeers(kademliaId: Uint8Array): Promise<PeerDescriptor[]> {
        logger.trace(`Requesting getClosestPeers on ${this.serviceId} from ${this.peerId.toKey()}`)
        const request: ClosestPeersRequest = {
            kademliaId: kademliaId,
            requestId: v4()
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: this.ownPeerDescriptor,
            targetDescriptor: this.peerDescriptor
        }
        try {
            const peers = await this.client.getClosestPeers(request, options)
            return peers.peers
        } catch (err) {
            logger.debug('error', { err })
            throw err
        }
    }

    async ping(): Promise<boolean> {
        logger.trace(`Requesting ping on ${this.serviceId} from ${this.peerId.toKey()}`)
        const request: PingRequest = {
            requestId: v4()
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: this.ownPeerDescriptor,
            targetDescriptor: this.peerDescriptor,
            timeout: 10000
        }
        try {
            const pong = await this.client.ping(request, options)
            if (pong.requestId === request.requestId) {
                return true
            }
        } catch (err) {
            logger.debug(`ping failed on ${this.serviceId} to ${this.peerId.toKey()}: ${err}`)
        }
        return false
    }

    leaveNotice(): void {
        logger.trace(`Sending leaveNotice on ${this.serviceId} from ${this.peerId.toKey()}`)
        const request: LeaveNotice = {
            serviceId: this.serviceId
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: this.ownPeerDescriptor,
            targetDescriptor: this.peerDescriptor,
            notification: true
        }
        this.client.leaveNotice(request, options).catch((e) => {
            logger.trace('Failed to send leaveNotice' + e)
        })
    }

    getPeerDescriptor(): PeerDescriptor {
        return this.peerDescriptor
    }

}
