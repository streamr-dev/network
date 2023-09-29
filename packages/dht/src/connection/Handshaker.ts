import { Logger } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { v4 } from 'uuid'
import { Message, HandshakeRequest, HandshakeResponse, MessageType, PeerDescriptor, HandshakeError } from '../proto/packages/dht/protos/DhtRpc'
import { IConnection } from './IConnection'

const logger = new Logger(module)

interface HandshakerEvents {
    handshakeRequest: (sourcePeerDescriptor: PeerDescriptor, presumedPeerDescriptor?: PeerDescriptor) => void
    handshakeCompleted: (peerDescriptor: PeerDescriptor) => void
    handshakeFailed: (error?: HandshakeError) => void
}

export class Handshaker extends EventEmitter<HandshakerEvents> {

    private static readonly HANDSHAKER_SERVICE_ID = 'system/handshaker'
    private ownPeerDescriptor: PeerDescriptor
    private protocolVersion: string
    private connection: IConnection

    constructor(
        ownPeerDescriptor: PeerDescriptor,
        protocolVersion: string, 
        connection: IConnection
    ) {
        super()
        this.ownPeerDescriptor = ownPeerDescriptor
        this.protocolVersion = protocolVersion
        this.connection = connection
        this.connection.on('data', this.onData)
    }

    private onData = (data: Uint8Array) => {
        try {
            const message = Message.fromBinary(data)
            if (message.body.oneofKind === 'handshakeRequest') {
                logger.trace('handshake request received')
                const handshake = message.body.handshakeRequest
                this.emit('handshakeRequest', handshake.sourcePeerDescriptor!, handshake.presumedPeerDescriptor)
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
            logger.trace(`Invalid data received: ${err}`)
        }
        
    }

    public sendHandshakeRequest(presumedPeerDescriptor?: PeerDescriptor): void {
        const outgoingHandshake: HandshakeRequest = {
            sourcePeerDescriptor: this.ownPeerDescriptor,
            presumedPeerDescriptor,
            protocolVersion: this.protocolVersion
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

    public sendHandshakeResponse(error?: HandshakeError): void {
        const outgoingHandshakeResponse: HandshakeResponse = {
            sourceId: this.ownPeerDescriptor.kademliaId,
            protocolVersion: this.protocolVersion,
            peerDescriptor: this.ownPeerDescriptor
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
