import { RpcRemote } from '../../dht/contact/RpcRemote'
import {
    IceCandidate,
    PeerDescriptor,
    RtcAnswer,
    RtcOffer,
    WebrtcConnectionRequest
} from '../../proto/packages/dht/protos/DhtRpc'
import { IWebrtcConnectorRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

export class WebrtcConnectorRpcRemote extends RpcRemote<IWebrtcConnectorRpcClient> {

    constructor(
        localPeerDescriptor: PeerDescriptor,
        remotePeerDescriptor: PeerDescriptor,
        client: ProtoRpcClient<IWebrtcConnectorRpcClient>
    ) {
        super(localPeerDescriptor, remotePeerDescriptor, 'DUMMY', client)
    }

    requestConnection(): void {
        const request: WebrtcConnectionRequest = {
        }
        const options = this.formDhtRpcOptions({
            notification: true
        })
        this.getClient().requestConnection(request, options).catch((_e) => {
            logger.trace('Failed to send requestConnection')
        })
    }

    sendRtcOffer(description: string, connectionId: string): void {
        const request: RtcOffer = {
            connectionId,
            description
        }
        const options = this.formDhtRpcOptions()
        this.getClient().rtcOffer(request, options).catch((_e) => {
            logger.trace('Failed to send rtcOffer')
        })
    }

    sendRtcAnswer(description: string, connectionId: string): void {
        const request: RtcAnswer = {
            connectionId,
            description
        }
        const options = this.formDhtRpcOptions()
        this.getClient().rtcAnswer(request, options).catch((_e) => {
            logger.trace('Failed to send rtcAnswer')
        })
    }

    sendIceCandidate(candidate: string, mid: string, connectionId: string): void {
        const request: IceCandidate = {
            connectionId,
            mid,
            candidate
        }
        const options = this.formDhtRpcOptions()
        this.getClient().iceCandidate(request, options).catch((_e) => {
            logger.trace('Failed to send iceCandidate')
        })
    }
}

