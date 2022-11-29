import { Logger } from "@streamr/utils"
import { EventEmitter } from "eventemitter3"
import { v4 } from "uuid"
// import { PeerID } from "../helpers/PeerID"
import { Message, HandshakeRequest, HandshakeResponse, MessageType, PeerDescriptor } from "../proto/DhtRpc"
import { IConnection } from "./IConnection"

const logger = new Logger(module)

interface HandshakerEvents {
    handshakeRequest: (peerDescriptor: PeerDescriptor) => void
    handshakeCompleted: (peerDescriptor: PeerDescriptor) => void
    handshakeFailed: (reason?: string) => void
}

export class Handshaker extends EventEmitter<HandshakerEvents> {

    private static readonly HANDSHAKER_SERVICE_ID = 'system/handshaker'

    constructor(private ownPeerDescriptor: PeerDescriptor, 
        private protocolVersion: string, 
        private connection: IConnection) {
        
        super()

        connection.on('data', (bytes: Uint8Array) => {
            this.onData(bytes)
        })
    }

    private onData = (data: Uint8Array) => {
        
        const message = Message.fromBinary(data)

        if (message.messageType === MessageType.HANDSHAKE_REQUEST) {
            logger.trace('handshake request received')
            const handshake = HandshakeRequest.fromBinary(message.body)
            this.emit('handshakeRequest', handshake.peerDescriptor!)
        }

        if (message.messageType === MessageType.HANDSHAKE_RESPONSE) {
            logger.trace('handshake response received')
            const handshake = HandshakeResponse.fromBinary(message.body)
            if (handshake.responseError) {
                this.emit('handshakeFailed', handshake.responseError)
            } else {
                this.emit('handshakeCompleted', handshake.peerDescriptor!)
            }
        }
    }

    public sendHandshakeRequest(): void {
       
        const outgoingHandshake: HandshakeRequest = {
            sourceId: this.ownPeerDescriptor.kademliaId,
            protocolVersion: this.protocolVersion,
            peerDescriptor: this.ownPeerDescriptor
        }
        const msg: Message = {
            serviceId: Handshaker.HANDSHAKER_SERVICE_ID,
            messageType: MessageType.HANDSHAKE_REQUEST,
            messageId: v4(),
            body: HandshakeRequest.toBinary(outgoingHandshake)
        }

        this.connection.send(Message.toBinary(msg))
        logger.trace('handshake request sent')
    }

    public sendHandshakeResponse(error?: string): void {
       
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
            body: HandshakeResponse.toBinary(outgoingHandshakeResponse)
        }

        this.connection.send(Message.toBinary(msg))
        logger.trace('handshake request sent')
    }
}
