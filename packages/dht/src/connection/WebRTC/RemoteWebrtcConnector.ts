require('setimmediate')
import {
    IceCandidate,
    PeerDescriptor,
    RtcAnswer,
    RtcOffer,
    WebRtcConnectionRequest
} from '../../proto/DhtRpc'
import { IWebRtcConnectorClient } from '../../proto/DhtRpc.client'
import { PeerID } from '../../helpers/PeerID'
import { DhtRpcOptions } from '../../rpc-protocol/DhtRpcOptions'
import { Logger } from '../../helpers/Logger'

const logger = new Logger(module)

export class RemoteWebrtcConnector {
    private peerId: PeerID
    constructor(private peerDescriptor: PeerDescriptor, private client: IWebRtcConnectorClient) {
        this.peerId = PeerID.fromValue(peerDescriptor.peerId)
    }

    async requestConnection(sourceDescriptor: PeerDescriptor, connectionId: string): Promise<boolean> {
        const request: WebRtcConnectionRequest = {
            target: this.peerDescriptor,
            requester: sourceDescriptor,
            connectionId
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: sourceDescriptor as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor,
            notification: true
        }
        try {
            const result = await this.client.requestConnection(request, options)
            return !!result.response
        } catch (err) {
            logger.debug(err)
            return false
        }
    }

    async sendRtcOffer(sourceDescriptor: PeerDescriptor, description: string, connectionId: string): Promise<boolean> {
        const request: RtcOffer = {
            target: this.peerDescriptor,
            requester: sourceDescriptor,
            connectionId,
            description
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: sourceDescriptor as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor,
            notification: true
        }
        try {
            const result = await this.client.rtcOffer(request, options)
            return !!result.response
        } catch (err) {
            logger.debug(err)
            return false
        }
    }

    async sendRtcAnswer(sourceDescriptor: PeerDescriptor, description: string, connectionId: string): Promise<boolean> {
        const request: RtcAnswer = {
            target: this.peerDescriptor,
            requester: sourceDescriptor,
            connectionId,
            description
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: sourceDescriptor as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor,
            notification: true
        }
        try {
            const result = await this.client.rtcAnswer(request, options)
            return !!result.response
        } catch (err) {
            logger.debug(err)
            return false
        }
    }

    async sendIceCandidate(sourceDescriptor: PeerDescriptor, candidate: string, mid: string, connectionId: string): Promise<boolean> {
        const request: IceCandidate = {
            target: this.peerDescriptor,
            requester: sourceDescriptor,
            connectionId,
            mid,
            candidate
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: sourceDescriptor as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor,
            notification: true
        }
        try {
            const result = await this.client.iceCandidate(request, options)
            return !!result.response
        } catch (err) {
            console.error(err)
            return false
        }
    }
}

