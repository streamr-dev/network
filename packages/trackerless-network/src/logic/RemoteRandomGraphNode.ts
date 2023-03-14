import { INetworkRpcClient } from '../proto/packages/trackerless-network/protos/NetworkRpc.client'
import { PeerDescriptor, UUID, DhtRpcOptions, keyFromPeerDescriptor } from '@streamr/dht'
import {
    StreamMessage,
    StreamHandshakeRequest,
    InterleaveNotice,
    LeaveStreamNotice
} from '../proto/packages/trackerless-network/protos/NetworkRpc'
import { Logger } from '@streamr/utils'
import { Remote } from './Remote'

interface HandshakeResponse {
    accepted: boolean
    interleaveTarget?: PeerDescriptor
}

const logger = new Logger(module)

export class RemoteRandomGraphNode extends Remote<INetworkRpcClient> {

    async handshake(
        ownPeerDescriptor: PeerDescriptor,
        neighbors: string[],
        peerView: string[],
        concurrentHandshakeTargetId?: string,
        interleaving = false,
        interleavingFrom?: string
    ): Promise<HandshakeResponse> {
        const request: StreamHandshakeRequest = {
            randomGraphId: this.graphId,
            requestId: new UUID().toString(),
            senderId: keyFromPeerDescriptor(ownPeerDescriptor),
            neighbors,
            peerView,
            concurrentHandshakeTargetId,
            interleaving,
            interleavingFrom,
            senderDescriptor: ownPeerDescriptor
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor as PeerDescriptor
        }
        try {
            const response = await this.client.handshake(request, options)
            return {
                accepted: response.accepted,
                interleaveTarget: response.interleaveTarget
            }
        } catch (err: any) {
            logger.debug(`handshake to ${keyFromPeerDescriptor(this.getPeerDescriptor())} failed: ${err}`)
            return {
                accepted: false
            }
        }
    }

    async sendData(ownPeerDescriptor: PeerDescriptor, msg: StreamMessage): Promise<void> {
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor as PeerDescriptor,
            notification: true
        }
        try {
            this.client.sendData(msg, options).catch(() => {
                logger.trace('Failed to sendData')
            })
        } catch (err: any) {
            logger.warn(err)
        }
    }

    interleaveNotice(ownPeerDescriptor: PeerDescriptor, originatorDescriptor: PeerDescriptor): void {
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor as PeerDescriptor,
            notification: true
        }
        const notification: InterleaveNotice = {
            randomGraphId: this.graphId,
            interleaveTarget: originatorDescriptor,
            senderId: keyFromPeerDescriptor(ownPeerDescriptor)
        }
        this.client.interleaveNotice(notification, options).catch(() => {
            logger.debug('Failed to send interleaveNotice')
        })
    }

    leaveStreamNotice(ownPeerDescriptor: PeerDescriptor): void {
        const options: DhtRpcOptions = {
            sourceDescriptor: ownPeerDescriptor as PeerDescriptor,
            targetDescriptor: this.remotePeerDescriptor as PeerDescriptor,
            notification: true
        }
        const notification: LeaveStreamNotice = {
            senderId: keyFromPeerDescriptor(ownPeerDescriptor),
            randomGraphId: this.graphId
        }
        this.client.leaveStreamNotice(notification, options).catch(() => {
            logger.debug('Failed to send leaveStreamNotice')
        })
    }
}
