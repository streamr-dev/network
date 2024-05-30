import { Logger } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { v4 } from 'uuid'
import { Message, HandshakeRequest, HandshakeResponse, PeerDescriptor, HandshakeError } from '../proto/packages/dht/protos/DhtRpc'
import { IConnection } from './IConnection'
import { LOCAL_PROTOCOL_VERSION, isMaybeSupportedVersion } from '../helpers/version'
import { getNodeIdFromPeerDescriptor } from '../identifiers'
import { PendingConnection } from './PendingConnection'

const logger = new Logger(module)

interface HandshakerEvents {
    handshakeRequest: (source: PeerDescriptor, version: string, target?: PeerDescriptor) => void
    handshakeCompleted: (remote: PeerDescriptor) => void
    handshakeFailed: (error?: HandshakeError) => void
}

export const createOutgoingHandshaker = (
    localPeerDescriptor: PeerDescriptor,
    pendingConnection: PendingConnection,
    connection: IConnection,
    onHandshakeCompleted: (peerDescriptor: PeerDescriptor, connection: IConnection) => void,
    targetPeerDescriptor?: PeerDescriptor
): Handshaker => {
    const handshaker = new Handshaker(localPeerDescriptor, connection)
    const stopHandshaker = () => {
        handshaker.stop()
        connection.off('disconnected', disconnectedListener)
        connection.off('connected', connectedListener)
        handshaker.off('handshakeCompleted', handshakeCompletedListener)
        handshaker.off('handshakeFailed', handshakeFailedListener)
        pendingConnection.off('disconnected', managedConnectionDisconnectedListener)
    }
    const handshakeFailedListener = (error?: HandshakeError) => {
        if (error === HandshakeError.INVALID_TARGET_PEER_DESCRIPTOR || error === HandshakeError.UNSUPPORTED_VERSION) {
            pendingConnection.close(false)
        } else {
            // NO-OP: the rejector should take care of destroying the connection.
        }
        stopHandshaker()
    }
    const handshakeCompletedListener = (peerDescriptor: PeerDescriptor) => {
        logger.trace('handshake completed for outgoing connection, ' + getNodeIdFromPeerDescriptor(peerDescriptor))
        onHandshakeCompleted(peerDescriptor, connection)
        stopHandshaker()
    }
    const connectedListener = () => handshaker.sendHandshakeRequest(targetPeerDescriptor)
    const disconnectedListener = (graceful: boolean) => { 
        pendingConnection.close(graceful)
        stopHandshaker()
    }
    const managedConnectionDisconnectedListener = () => {
        connection.close(false)
        stopHandshaker()
    }
    handshaker.once('handshakeFailed', handshakeFailedListener)
    handshaker.once('handshakeCompleted', handshakeCompletedListener)
    connection.once('connected', connectedListener)
    connection.once('disconnected', disconnectedListener)
    pendingConnection.once('disconnected', managedConnectionDisconnectedListener)
    return handshaker
}

export const createIncomingHandshaker = (
    localPeerDescriptor: PeerDescriptor,
    pendingConnection: PendingConnection,
    connection: IConnection
): Handshaker => {
    const handshaker = new Handshaker(localPeerDescriptor, connection)
    const stopHandshaker = () => {
        handshaker.stop()
        pendingConnection.off('disconnected', connectionDisconnected)
        connection.off('disconnected', connectionDisconnected)
    }
    const onHandshakeRequest = (): void => {
        stopHandshaker()
    }
    const connectionDisconnected = (graceful: boolean) => {
        pendingConnection.close(graceful)
        stopHandshaker()
    }
    const managedConnectionDisconnected = () => {
        connection.close(false)
        stopHandshaker()
    }
    handshaker.on('handshakeRequest', onHandshakeRequest)
    connection.once('disconnected', connectionDisconnected)
    pendingConnection.once('disconnected', managedConnectionDisconnected)
    return handshaker
}

export const rejectHandshake = (
    pendingConnection: PendingConnection,
    connection: IConnection,
    handshaker: Handshaker,
    error: HandshakeError
): void => {
    handshaker.sendHandshakeResponse(error)
    connection.destroy()
    pendingConnection.destroy('HANDSHAKE FAILED')
}

export const acceptHandshake = (handshaker: Handshaker): void => {
    handshaker.sendHandshakeResponse()
    // managedConnection.attachConnection(sourcePeerDescriptor, connection)
}

export const createHandshakeRequest = (localPeerDescriptor: PeerDescriptor, remotePeerDescriptor: PeerDescriptor): Message => {
    const outgoingHandshake: HandshakeRequest = {
        sourcePeerDescriptor: localPeerDescriptor,
        targetPeerDescriptor: remotePeerDescriptor,
        version: LOCAL_PROTOCOL_VERSION
    }
    return {
        serviceId: Handshaker.HANDSHAKER_SERVICE_ID,
        messageId: v4(),
        body: {
            oneofKind: 'handshakeRequest',
            handshakeRequest: outgoingHandshake
        }
    }
} 

export const createHandshakeResponse = (localPeerDescriptor: PeerDescriptor, error?: HandshakeError): Message => {
    const outgoingHandshakeResponse: HandshakeResponse = {
        sourcePeerDescriptor: localPeerDescriptor,
        error,
        version: LOCAL_PROTOCOL_VERSION
    }
    return {
        serviceId: Handshaker.HANDSHAKER_SERVICE_ID,
        messageId: v4(),
        body: {
            oneofKind: 'handshakeResponse',
            handshakeResponse: outgoingHandshakeResponse
        }
    }
}

export class Handshaker extends EventEmitter<HandshakerEvents> {

    public static readonly HANDSHAKER_SERVICE_ID = 'system/handshaker'
    private localPeerDescriptor: PeerDescriptor
    private connection: IConnection
    private readonly onDataListener: (data: Uint8Array) => void
    constructor(
        localPeerDescriptor: PeerDescriptor,
        connection: IConnection
    ) {
        super()
        this.localPeerDescriptor = localPeerDescriptor
        this.connection = connection
        this.onDataListener = (data: Uint8Array) => this.onData(data)
        this.connection.on('data', this.onDataListener)
    }

    private onData(data: Uint8Array) {
        try {
            const message = Message.fromBinary(data)
            if (message.body.oneofKind === 'handshakeRequest') {
                logger.trace('handshake request received')
                const handshake = message.body.handshakeRequest
                this.emit(
                    'handshakeRequest',
                    handshake.sourcePeerDescriptor!, 
                    handshake.version,
                    handshake.targetPeerDescriptor
                )
            }
            if (message.body.oneofKind === 'handshakeResponse') {
                logger.trace('handshake response received')
                const handshake = message.body.handshakeResponse
                const error = !isMaybeSupportedVersion(handshake.version) ? HandshakeError.UNSUPPORTED_VERSION : handshake.error
                if (error !== undefined) {
                    this.emit('handshakeFailed', error)
                } else {
                    this.emit('handshakeCompleted', handshake.sourcePeerDescriptor!)
                }
            }
        } catch (err) {
            logger.debug('error while parsing handshake message', err)
        }
        
    }

    public sendHandshakeRequest(remotePeerDescriptor?: PeerDescriptor): void {
        const msg = createHandshakeRequest(this.localPeerDescriptor, remotePeerDescriptor!)
        this.connection.send(Message.toBinary(msg))
        logger.trace('handshake request sent')
    }

    public sendHandshakeResponse(error?: HandshakeError): void {
        const msg = createHandshakeResponse(this.localPeerDescriptor, error)
        this.connection.send(Message.toBinary(msg))
        logger.trace('handshake response sent')
    }

    public stop(): void {
        this.connection.off('data', this.onDataListener)
        this.removeAllListeners()
    }
}
