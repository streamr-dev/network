import EventEmitter from 'eventemitter3'
import { 
    createHandshakeRequest,
    createHandshakeResponse,
    createIncomingHandshaker,
    createOutgoingHandshaker,
    Handshaker
} from '../../src/connection/Handshaker'
import { ConnectionEvents, IConnection } from '../../src/connection/IConnection'
import { createMockPeerDescriptor } from '../utils/utils'
import { HandshakeError, Message } from '../../src/proto/packages/dht/protos/DhtRpc'
import { PendingConnection } from '../../src/connection/PendingConnection'

describe('Handshaker', () => {

    let handshaker: Handshaker
    let pendingConnection: PendingConnection
    let connection: IConnection

    let mockOnHandshakeCompleted: () => void
    let mockSend: () => void
    let mockConnectionClose: () => void
    let mockPendingConnectionClose: () => void

    beforeEach(() => {
        mockOnHandshakeCompleted = jest.fn()
        mockPendingConnectionClose = jest.fn()
        pendingConnection = new class extends EventEmitter {
            // eslint-disable-next-line class-methods-use-this
            attachConnection() { 
                mockOnHandshakeCompleted()
            }
            // eslint-disable-next-line class-methods-use-this
            close() {
                mockPendingConnectionClose()
            }
        } as any

        mockSend = jest.fn()
        mockConnectionClose = jest.fn()
        connection = new class extends EventEmitter<ConnectionEvents> {
            // eslint-disable-next-line class-methods-use-this
            send(_message: any) {
                mockSend()
            }
            // eslint-disable-next-line class-methods-use-this
            close() {
                mockConnectionClose()
            }
        } as any    
    })

    describe('Outgoing', () => {

        beforeEach(() => {
            handshaker = createOutgoingHandshaker(
                createMockPeerDescriptor(),
                pendingConnection,
                connection,
                mockOnHandshakeCompleted,
                createMockPeerDescriptor()
            )
        })

        afterEach(() => {
            handshaker.stop()
        })

        it('sends request after connected', () => {
            (connection as any).emit('connected')
            expect(mockSend).toHaveBeenCalledTimes(1)
        })

        it('onHandshakeCompleted', () => {
            const message = createHandshakeResponse(createMockPeerDescriptor());
            (connection as any).emit('data', Message.toBinary(message))
            handshaker.emit('handshakeCompleted', createMockPeerDescriptor())
            expect(mockOnHandshakeCompleted).toHaveBeenCalledTimes(1)
        })

        it('onHandshakeFailed invalid PeerDescriptor', () => {
            handshaker.emit('handshakeFailed', HandshakeError.INVALID_TARGET_PEER_DESCRIPTOR)
            expect(mockOnHandshakeCompleted).not.toHaveBeenCalled()
        })

        it('onHandshakeFailed unsupported version', () => {
            handshaker.emit('handshakeFailed', HandshakeError.UNSUPPORTED_VERSION)
            expect(mockOnHandshakeCompleted).not.toHaveBeenCalled()
            expect(mockPendingConnectionClose).toHaveBeenCalledTimes(1)
        })

        it('onHandShakeFailed ', () => {
            handshaker.emit('handshakeFailed', HandshakeError.DUPLICATE_CONNECTION)
            expect(mockOnHandshakeCompleted).not.toHaveBeenCalled()
        })

        it('calls pending connection close if connection closes', () => {
            (connection as any).emit('disconnected')
            expect(mockPendingConnectionClose).toHaveBeenCalledTimes(1)
        })

        it('closes connection if managed connection closes', () => {
            (pendingConnection as any).emit('disconnected')
            expect(mockConnectionClose).toHaveBeenCalledTimes(1)
        })

    })

    describe('Incoming', () => {

        beforeEach(() => {
            handshaker = createIncomingHandshaker(createMockPeerDescriptor(), pendingConnection, connection)
        })

        afterEach(() => {
            handshaker.stop()
        })

        it('onHandshakeRequest', () => {
            const message = createHandshakeRequest(createMockPeerDescriptor(), createMockPeerDescriptor());
            (connection as any).emit('data', Message.toBinary(message))
            handshaker.emit('handshakeRequest', createMockPeerDescriptor(), '1.0')
        })

        it('calls pending connection onDisconnected if connection closes', () => {
            (connection as any).emit('disconnected')
            expect(mockPendingConnectionClose).toHaveBeenCalledTimes(1)
        })

        it('closes connection if managed connection closes', () => {
            (pendingConnection as any).emit('disconnected')
            expect(mockConnectionClose).toHaveBeenCalledTimes(1)
        })

    })

})
