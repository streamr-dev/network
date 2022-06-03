import {
    IceCandidate,
    NotificationResponse,
    PeerDescriptor,
    RtcAnswer,
    RtcOffer,
    WebRtcConnectionRequest
} from '../../proto/DhtRpc'
import { IWebRtcConnectorClient } from '../../proto/DhtRpc.client'
import { PeerID } from '../../helpers/PeerID'
import { DhtRpcOptions } from '../../rpc-protocol/ClientTransport'
import { TODO } from '../../types'
import { IWebRtcConnector } from '../../proto/DhtRpc.server'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { DummyServerCallContext } from '../../rpc-protocol/ServerTransport'
import { Logger } from '../../helpers/Logger'
import { parseWrapper } from '../../rpc-protocol/ConversionWrappers'

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
            const response = await this.client.requestConnection(request, options).response
            return response.sent
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
            const response = await this.client.rtcOffer(request, options).response
            return response.sent
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
            const response = await this.client.rtcAnswer(request, options).response
            return response.sent
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
            const response = await this.client.iceCandidate(request, options).response
            return response.sent
        } catch (err) {
            console.error(err)
            return false
        }
    }
}

export const createRemoteWebRtcConnectorServer = (onRtcOffer: TODO, onRtcAnswer: TODO, onIceCandidate: TODO, connectFn: TODO): any => {
    const rpc: IWebRtcConnector = {
        async requestConnection(request: WebRtcConnectionRequest, _context: ServerCallContext): Promise<NotificationResponse> {
            setImmediate(() => connectFn(request.requester, request.target, request.connectionId))
            const res: NotificationResponse = {
                sent: true
            }
            return res
        },
        async rtcOffer(request: RtcOffer, _context: ServerCallContext): Promise<NotificationResponse> {
            setImmediate(() => onRtcOffer(request.requester, request.target, request.description, request.connectionId))
            const res: NotificationResponse = {
                sent: true
            }
            return res
        },
        async rtcAnswer(request: RtcAnswer, _context: ServerCallContext): Promise<NotificationResponse> {
            setImmediate(() => onRtcAnswer(request.requester, request.target, request.description, request.connectionId))
            const res: NotificationResponse = {
                sent: true
            }
            return res
        },
        async iceCandidate(request: IceCandidate, _context: ServerCallContext): Promise<NotificationResponse> {
            setImmediate(() => onIceCandidate(request.requester, request.target, request.candidate, request.mid, request.connectionId))
            const res: NotificationResponse = {
                sent: true
            }
            return res
        }
    }
    const register = {
        async requestConnection(bytes: Uint8Array): Promise<void> {
            const request = parseWrapper<WebRtcConnectionRequest>(() => WebRtcConnectionRequest.fromBinary(bytes))
            await rpc.requestConnection(request, new DummyServerCallContext())
        },
        async rtcOffer(bytes: Uint8Array): Promise<void> {
            const request = parseWrapper<RtcOffer>(() => RtcOffer.fromBinary(bytes))
            await rpc.rtcOffer(request, new DummyServerCallContext())
        },
        async rtcAnswer(bytes: Uint8Array): Promise<void> {
            const request = parseWrapper<RtcAnswer>(() => RtcAnswer.fromBinary(bytes))
            await rpc.rtcAnswer(request, new DummyServerCallContext())
        },
        async iceCandidate(bytes: Uint8Array): Promise<void> {
            const request = parseWrapper<IceCandidate>(() => IceCandidate.fromBinary(bytes))
            await rpc.iceCandidate(request, new DummyServerCallContext())
        }
    }
    return register
}
