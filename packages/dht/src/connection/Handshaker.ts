import { Logger } from "@streamr/utils"
import { EventEmitter } from "eventemitter3"
import { v4 } from "uuid"
import { PeerID } from "../helpers/PeerID"
import { Message, HandshakeMessage, MessageType, PeerDescriptor } from "../proto/DhtRpc"
import { IConnection } from "./IConnection"

const logger = new Logger(module)

interface HandshakerEvents {
    handshakeCompleted: (peerDescriptor: PeerDescriptor) => void
    handshakeFailed: (peerId: PeerID) => void
}

export class Handshaker extends EventEmitter<HandshakerEvents> {

    private static readonly HANDSHAKER_SERVICE_ID = 'system/handshaker'

    private ownPeerDescriptor: PeerDescriptor
    private protocolVersion: string
    private connection: IConnection

    constructor(ownPeerDescriptor: PeerDescriptor, 
        protocolVersion: string, 
        connection: IConnection) {
        super()
        this.ownPeerDescriptor = ownPeerDescriptor
        this.protocolVersion = protocolVersion
        this.connection = connection
        this.connection.on('data', this.onData)
    }

    public run(): void {
        this.sendHandshakeMessage()
    }

    private onData = (data: Uint8Array) => {
        
        const message = Message.fromBinary(data)

        if (message.messageType === MessageType.HANDSHAKE) {
            logger.trace('handshake message received')
            const handshake = HandshakeMessage.fromBinary(message.body)
            //this.connection.off(this.onData)
            this.emit('handshakeCompleted', handshake.peerDescriptor!)
        }
    }

    private sendHandshakeMessage() {
       
        const outgoingHandshake: HandshakeMessage = {
            sourceId: this.ownPeerDescriptor.peerId,
            protocolVersion: this.protocolVersion,
            peerDescriptor: this.ownPeerDescriptor
        }
        const msg: Message = {
            serviceId: Handshaker.HANDSHAKER_SERVICE_ID,
            messageType: MessageType.HANDSHAKE,
            messageId: v4(),
            body: HandshakeMessage.toBinary(outgoingHandshake)
        }

        this.connection.send(Message.toBinary(msg))
        logger.trace('handshake message sent')
    }
}
