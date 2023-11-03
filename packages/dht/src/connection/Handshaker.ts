import { Logger } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { v4 } from 'uuid'
import { Message, HandshakeRequest, HandshakeResponse, MessageType, PeerDescriptor } from '../proto/packages/dht/protos/DhtRpc'
import { IConnection } from './IConnection'

const logger = new Logger(module)

interface HandshakerEvents {
    handshakeRequest: (peerDescriptor: PeerDescriptor) => void
    handshakeCompleted: (peerDescriptor: PeerDescriptor) => void
    handshakeFailed: (reason?: string) => void
}

export class Handshaker extends EventEmitter<HandshakerEvents> {

    private static readonly HANDSHAKER_SERVICE_ID = 'system/handshaker'
    private localPeerDescriptor: PeerDescriptor
    private connection: IConnection

    constructor(
        localPeerDescriptor: PeerDescriptor,
        connection: IConnection
    ) {
        super()
        this.localPeerDescriptor = localPeerDescriptor
        this.connection = connection
        this.connection.on('data', this.onData)
    }

    private onData = (data: Uint8Array) => {
        try {
            const message = Message.fromBinary(data)
            if (message.body.oneofKind === 'handshakeRequest') {
                logger.trace('handshake request received')
                const handshake = message.body.handshakeRequest
                this.emit('handshakeRequest', handshake.peerDescriptor!)
            }
            if (message.body.oneofKind === 'handshakeResponse') {
                logger.trace('handshake response received')
                const handshake = message.body.handshakeResponse
                if (handshake.responseError) {
                    this.emit('handshakeFailed', handshake.responseError)
                } else {
                    this.emit('handshakeCompleted', handshake.peerDescriptor!)
                }
            }
        } catch (err) {
            logger.error('error while parsing handshake message', err)
        }
        
    }

    public sendHandshakeRequest(): void {
        const outgoingHandshake: HandshakeRequest = {
            sourceId: this.localPeerDescriptor.kademliaId,
            peerDescriptor: this.localPeerDescriptor
        }
        const msg: Message = {
            serviceId: Handshaker.HANDSHAKER_SERVICE_ID,
            messageType: MessageType.HANDSHAKE_REQUEST,
            messageId: v4(),
            body: {
                oneofKind: 'handshakeRequest',
                handshakeRequest: outgoingHandshake
            }
        }
        this.connection.send(Message.toBinary(msg))
        logger.trace('handshake request sent')
    }

    public sendHandshakeResponse(error?: string): void {
        const outgoingHandshakeResponse: HandshakeResponse = {
            sourceId: this.localPeerDescriptor.kademliaId,
            peerDescriptor: this.localPeerDescriptor
        }
        if (error) {
            outgoingHandshakeResponse.responseError = error
        }
        const msg: Message = {
            serviceId: Handshaker.HANDSHAKER_SERVICE_ID,
            messageType: MessageType.HANDSHAKE_RESPONSE,
            messageId: v4(),
            body: {
                oneofKind: 'handshakeResponse',
                handshakeResponse: outgoingHandshakeResponse
            }
        }
        this.connection.send(Message.toBinary(msg))
        logger.trace('handshake request sent')
    }
}
