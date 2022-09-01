import { Logger } from "@streamr/utils"
import { EventEmitter } from "eventemitter3"
import { v4 } from "uuid"
import { PeerID } from "../helpers/PeerID"
import { Message, HandshakeMessage, MessageType, PeerDescriptor } from "../proto/DhtRpc"
import { IConnection } from "./IConnection"

const logger = new Logger(module)

interface HandshakerEvent {
    HANDSHAKE_COMPLETED: (peerDescriptor: PeerDescriptor) => void
    HANDSHAKE_FAILED: (peerId: PeerID) => void
}

export class Handshaker extends EventEmitter<HandshakerEvent> {

    private static HANDSHAKER_SERVICE_ID = 'handshaker'

    constructor(private ownPeerDescriptor: PeerDescriptor, 
        private protocolVersion: string, 
        private connection: IConnection) {
        super()
        this.connection.on('DATA', this.onData)
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
            this.emit('HANDSHAKE_COMPLETED', handshake.peerDescriptor!)
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
