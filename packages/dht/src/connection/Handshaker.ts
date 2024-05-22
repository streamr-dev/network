import { Logger } from '@streamr/utils'
import { EventEmitter } from 'eventemitter3'
import { v4 } from 'uuid'
import { Message, HandshakeRequest, HandshakeResponse, PeerDescriptor, HandshakeError } from '../proto/packages/dht/protos/DhtRpc'
import { IConnection } from './IConnection'
import { LOCAL_PROTOCOL_VERSION, isMaybeSupportedVersion } from '../helpers/version'
import { ManagedConnection } from './ManagedConnection'
import { getNodeIdFromPeerDescriptor } from '../identifiers'

const logger = new Logger(module)

interface HandshakerEvents {
    handshakeRequest: (source: PeerDescriptor, version: string, target?: PeerDescriptor) => void
    handshakeCompleted: (remote: PeerDescriptor) => void
    handshakeFailed: (error?: HandshakeError) => void
}

export const createOutgoingHandshaker = (
    localPeerDescriptor: PeerDescriptor,
    managedConnection: ManagedConnection,
    connection: IConnection,
    targetPeerDescriptor?: PeerDescriptor
): Handshaker => {
    const handshaker = new Handshaker(localPeerDescriptor, connection)
    const handshakeFailedListener = (error?: HandshakeError) => {
        if (error === HandshakeError.INVALID_TARGET_PEER_DESCRIPTOR || error === HandshakeError.UNSUPPORTED_VERSION) {
            managedConnection.close(false)
        } else {
            // NO-OP: the rejector should take care of destroying the connection.
        }
        handshaker.stop()
        connection.off('disconnected', disconnectedListener)
        connection.off('connected', connectedListener)
    }
    const handshakeCompletedListener = (peerDescriptor: PeerDescriptor) => {
        logger.trace('handshake completed for outgoing connection, ' + getNodeIdFromPeerDescriptor(peerDescriptor))
        managedConnection.attachImplementation(connection)
        managedConnection.onHandshakeCompleted(peerDescriptor)
        handshaker.stop()
        handshaker.off('handshakeCompleted', handshakeCompletedListener)
        connection.off('disconnected', disconnectedListener)
        connection.off('connected', connectedListener)
    }
    const connectedListener = () => handshaker.sendHandshakeRequest(targetPeerDescriptor)
    const disconnectedListener = (graceful: boolean) => { 
        managedConnection.onDisconnected(graceful)
        handshaker.stop()
        connection.off('disconnected', disconnectedListener)
        connection.off('connected', connectedListener)
    }

    handshaker.once('handshakeFailed', handshakeFailedListener)
    handshaker.on('handshakeCompleted', handshakeCompletedListener)
    connection.once('connected', connectedListener)
    connection.once('disconnected', disconnectedListener)

    const managedConnectionDisconnectedListener = () => {
        handshaker.stop()
        managedConnection.off('disconnected', managedConnectionDisconnectedListener)
    }
    managedConnection.once('disconnected', managedConnectionDisconnectedListener)
    return handshaker
}

export const createIncomingHandshaker = (
    localPeerDescriptor: PeerDescriptor,
    managedConnection: ManagedConnection,
    connection: IConnection
): Handshaker => {
    const handshaker = new Handshaker(localPeerDescriptor, connection)
    handshaker.on('handshakeRequest', (sourcePeerDescriptor: PeerDescriptor): void => {
        managedConnection.setRemotePeerDescriptor(sourcePeerDescriptor)
    })
    const connectionDisconnected = (graceful: boolean) => {
        managedConnection.onDisconnected(graceful)
        handshaker.stop()
        connection.off('disconnected', connectionDisconnected)
        handshaker.off('handshakeCompleted', stopHandshaker)
        handshaker.off('handshakeFailed', stopHandshaker)
        managedConnection.off('disconnected', connectionDisconnected)
    }
    const stopHandshaker = () => {
        handshaker.stop()
        managedConnection.off('disconnected', connectionDisconnected)
        connection.off('disconnected', connectionDisconnected)
        handshaker.off('handshakeCompleted', stopHandshaker)
        handshaker.off('handshakeFailed', stopHandshaker)
    }
    connection.on('disconnected', connectionDisconnected)
    handshaker.on('handshakeCompleted', stopHandshaker)
    handshaker.on('handshakeFailed', stopHandshaker)
    managedConnection.once('disconnected', stopHandshaker)
    return handshaker
}

export const rejectHandshake = (
    managedConnection: ManagedConnection,
    connection: IConnection,
    handshaker: Handshaker,
    error: HandshakeError
): void => {
    handshaker.sendHandshakeResponse(error)
    connection.destroy()
    managedConnection.destroy()   
}

export const acceptHandshake = (
    managedConnection: ManagedConnection,
    connection: IConnection,
    handshaker: Handshaker,
    sourcePeerDescriptor: PeerDescriptor
): void => {
    managedConnection.attachImplementation(connection)
    handshaker.sendHandshakeResponse()
    managedConnection.onHandshakeCompleted(sourcePeerDescriptor)
}

export class Handshaker extends EventEmitter<HandshakerEvents> {

    private static readonly HANDSHAKER_SERVICE_ID = 'system/handshaker'
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
        const outgoingHandshake: HandshakeRequest = {
            sourcePeerDescriptor: this.localPeerDescriptor,
            targetPeerDescriptor: remotePeerDescriptor,
            version: LOCAL_PROTOCOL_VERSION
        }
        const msg: Message = {
            serviceId: Handshaker.HANDSHAKER_SERVICE_ID,
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
            sourcePeerDescriptor: this.localPeerDescriptor,
            error,
            version: LOCAL_PROTOCOL_VERSION
        }
        const msg: Message = {
            serviceId: Handshaker.HANDSHAKER_SERVICE_ID,
            messageId: v4(),
            body: {
                oneofKind: 'handshakeResponse',
                handshakeResponse: outgoingHandshakeResponse
            }
        }
        this.connection.send(Message.toBinary(msg))
        logger.trace('handshake response sent')
    }

    public stop(): void {
        this.connection.off('data', this.onDataListener)
        this.removeAllListeners()
    }
}
