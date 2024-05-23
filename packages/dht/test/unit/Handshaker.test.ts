import EventEmitter from 'eventemitter3'
import { createIncomingHandshaker, Handshaker } from '../../src/connection/Handshaker'
import { ConnectionEvents, IConnection } from '../../src/connection/IConnection'
import { createOutgoingHandshaker, ManagedConnection } from '../../src/exports'
import { createMockPeerDescriptor } from '../utils/utils'
import { HandshakeError } from '../../src/proto/packages/dht/protos/DhtRpc'

describe('Handshaker', () => {

    let handshaker: Handshaker
    let managedConnection: ManagedConnection
    let connection: IConnection

    let mockAttachImplementation: () => void
    let mockOnHandshakeCompleted: () => void
    let mockOnDisconnected: () => void
    let mockSend: () => void
    let mockConnectionClose: () => void
    let mockManagedConnectionClose: () => void
    let mockSetRemotePeerDescriptor: () => void

    beforeEach(() => {
        mockAttachImplementation = jest.fn()
        mockOnHandshakeCompleted = jest.fn()
        mockOnDisconnected = jest.fn()
        mockManagedConnectionClose = jest.fn()
        mockSetRemotePeerDescriptor = jest.fn()
        managedConnection = new class extends EventEmitter {
            // eslint-disable-next-line class-methods-use-this
            onHandshakeCompleted() { 
                mockOnHandshakeCompleted()
            }
            // eslint-disable-next-line class-methods-use-this
            attachImplementation(_connection: IConnection) {
                mockAttachImplementation()
            }
            // eslint-disable-next-line class-methods-use-this
            onDisconnected() {
                mockOnDisconnected()
            }
            // eslint-disable-next-line class-methods-use-this
            close() {
                mockManagedConnectionClose()
            }
            // eslint-disable-next-line class-methods-use-this
            setRemotePeerDescriptor() {
                mockSetRemotePeerDescriptor()
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
            handshaker = createOutgoingHandshaker(createMockPeerDescriptor(), managedConnection, connection, createMockPeerDescriptor())
        })

        afterEach(() => {
            handshaker.stop()
        })

        it('sends request after connected', () => {
            (connection as any).emit('connected')
            expect(mockSend).toHaveBeenCalledTimes(1)
        })

        it('onHandshakeCompleted', () => {
            handshaker.emit('handshakeCompleted', createMockPeerDescriptor())
            expect(mockAttachImplementation).toHaveBeenCalledTimes(1)
            expect(mockOnHandshakeCompleted).toHaveBeenCalledTimes(1)
        })

        it('onHandshakeFailed invalid PeerDescriptor', () => {
            handshaker.emit('handshakeFailed', HandshakeError.INVALID_TARGET_PEER_DESCRIPTOR)
            expect(mockOnHandshakeCompleted).not.toHaveBeenCalled()
            expect(mockManagedConnectionClose).toHaveBeenCalledTimes(1)
        })

        it('onHandshakeFailed unsupported version', () => {
            handshaker.emit('handshakeFailed', HandshakeError.UNSUPPORTED_VERSION)
            expect(mockOnHandshakeCompleted).not.toHaveBeenCalled()
            expect(mockManagedConnectionClose).toHaveBeenCalledTimes(1)
        })

        it('onHandShakeFailed ', () => {
            handshaker.emit('handshakeFailed', HandshakeError.DUPLICATE_CONNECTION)
            expect(mockOnHandshakeCompleted).not.toHaveBeenCalled()
        })

        it('calls managed connection onDisconnected if connection closes', () => {
            (connection as any).emit('disconnected')
            expect(mockOnDisconnected).toHaveBeenCalledTimes(1)
        })

        it('closes connection if managed connection closes', () => {
            (managedConnection as any).emit('disconnected')
            expect(mockConnectionClose).toHaveBeenCalledTimes(1)
        })

    })

    describe('Incoming', () => {

        beforeEach(() => {
            handshaker = createIncomingHandshaker(createMockPeerDescriptor(), managedConnection, connection)
        })

        afterEach(() => {
            handshaker.stop()
        })

        it('onHandshakeRequest', () => {
            handshaker.emit('handshakeRequest', createMockPeerDescriptor(), '1.0')
            expect(mockSetRemotePeerDescriptor).toHaveBeenCalledTimes(1)
        })

        it('calls managed connection onDisconnected if connection closes', () => {
            (connection as any).emit('disconnected')
            expect(mockOnDisconnected).toHaveBeenCalledTimes(1)
        })

        it('closes connection if managed connection closes', () => {
            (managedConnection as any).emit('disconnected')
            expect(mockConnectionClose).toHaveBeenCalledTimes(1)
        })

    })

})
