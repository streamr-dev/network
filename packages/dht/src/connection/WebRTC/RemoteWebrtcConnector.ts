import 'setimmediate'
import {
    IceCandidate,
    PeerDescriptor,
    RtcAnswer,
    RtcOffer,
    WebRtcConnectionRequest
} from '../../proto/DhtRpc'
import { IWebRtcConnectorClient } from '../../proto/DhtRpc.client'
import { DhtRpcOptions } from '../../rpc-protocol/DhtRpcOptions'
import { ProtoRpcClient } from '@streamr/proto-rpc'

export class RemoteWebrtcConnector {
    constructor(private peerDescriptor: PeerDescriptor, private client: ProtoRpcClient<IWebRtcConnectorClient>) {
    }

    requestConnection(sourceDescriptor: PeerDescriptor, connectionId: string): void {
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

        this.client.requestConnection(request, options)
    }

    sendRtcOffer(sourceDescriptor: PeerDescriptor, description: string, connectionId: string): void {
        const request: RtcOffer = {
            target: this.peerDescriptor,
            requester: sourceDescriptor,
            connectionId,
            description
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: sourceDescriptor as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor,
        }

        this.client.rtcOffer(request, options)
    }

    sendRtcAnswer(sourceDescriptor: PeerDescriptor, description: string, connectionId: string): void {
        const request: RtcAnswer = {
            target: this.peerDescriptor,
            requester: sourceDescriptor,
            connectionId,
            description
        }
        const options: DhtRpcOptions = {
            sourceDescriptor: sourceDescriptor as PeerDescriptor,
            targetDescriptor: this.peerDescriptor as PeerDescriptor,
        }

        this.client.rtcAnswer(request, options)
    }

    sendIceCandidate(sourceDescriptor: PeerDescriptor, candidate: string, mid: string, connectionId: string): void {
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
        }
        this.client.iceCandidate(request, options)
    }
}

