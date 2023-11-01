import { Remote } from '../../dht/contact/Remote'
import {
    IceCandidate,
    PeerDescriptor,
    RtcAnswer,
    RtcOffer,
    WebRtcConnectionRequest
} from '../../proto/packages/dht/protos/DhtRpc'
import { IWebRtcConnectorRpcClient } from '../../proto/packages/dht/protos/DhtRpc.client'
import { ProtoRpcClient } from '@streamr/proto-rpc'
import { Logger } from '@streamr/utils'

const logger = new Logger(module)

export class WebRtcConnectorRpcRemote extends Remote<IWebRtcConnectorRpcClient> {

    constructor(
        localPeerDescriptor: PeerDescriptor,
        remotePeerDescriptor: PeerDescriptor,
        client: ProtoRpcClient<IWebRtcConnectorRpcClient>
    ) {
        super(localPeerDescriptor, remotePeerDescriptor, 'DUMMY', client)
    }

    requestConnection(connectionId: string): void {
        const request: WebRtcConnectionRequest = {
            connectionId
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

