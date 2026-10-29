import { EventEmitter } from 'eventemitter3'
import { HandshakeError, Message } from '../../generated/packages/dht/protos/DhtRpc'
import { createHandshakeRequest, createHandshakeResponse, Handshaker } from '../../src/connection/Handshaker'
import { ConnectionEvents, IConnection } from '../../src/connection/IConnection'
import { createMockPeerDescriptor } from '../utils/utils'

/**
 * The handshake carries each end's transport capabilities (e.g. the WebRTC
 * media channel) and hands the remote's list to the connection before the
 * handshake is accepted or completed.
 */
class PlainConnection extends EventEmitter<ConnectionEvents> implements IConnection {
    public sent: Message[] = []
    public closed = false
    send(data: Uint8Array): void {
        this.sent.push(Message.fromBinary(data))
    }
    async close(): Promise<void> {
        this.closed = true
    }
    destroy(): void {
        this.closed = true
    }
}

class CapableConnection extends PlainConnection {
    public remoteCapabilities?: string[]
    private readonly local: string[]
    constructor(local: string[]) {
        super()
        this.local = local
    }
    getLocalCapabilities(): string[] {
        return this.local
    }
    setRemoteCapabilities(capabilities: string[]): void {
        this.remoteCapabilities = capabilities
    }
}

describe('Handshaker capabilities', () => {

    const local = createMockPeerDescriptor()
    const remote = createMockPeerDescriptor()

    it('the request and the response advertise the connection\'s local capabilities', () => {
        const connection = new CapableConnection(['webrtc-media-channel/1'])
        const handshaker = new Handshaker(local, connection)
        handshaker.sendHandshakeRequest(remote)
        handshaker.sendHandshakeResponse()
        expect(connection.sent).toHaveLength(2)
        const request = connection.sent[0].body
        const response = connection.sent[1].body
        expect(request.oneofKind === 'handshakeRequest' && request.handshakeRequest.capabilities).toEqual(['webrtc-media-channel/1'])
        expect(response.oneofKind === 'handshakeResponse' && response.handshakeResponse.capabilities).toEqual(['webrtc-media-channel/1'])
        handshaker.stop()
    })

    it('a connection without capabilities advertises none, and old-style messages still parse', () => {
        const connection = new PlainConnection()
        const handshaker = new Handshaker(local, connection)
        handshaker.sendHandshakeRequest(remote)
        const request = connection.sent[0].body
        expect(request.oneofKind === 'handshakeRequest' && request.handshakeRequest.capabilities).toEqual([])
        // a message built by the old helper signature (no capabilities) is still a valid request
        const legacy = createHandshakeRequest(remote, local)
        expect(() => connection.emit('data', Message.toBinary(legacy))).not.toThrow()
        handshaker.stop()
    })

    it('an incoming request hands the remote capabilities to the connection before emitting', () => {
        const connection = new CapableConnection(['webrtc-media-channel/1'])
        const handshaker = new Handshaker(local, connection)
        let capabilitiesAtEmit: string[] | undefined
        handshaker.on('handshakeRequest', () => {
            capabilitiesAtEmit = connection.remoteCapabilities
        })
        const request = createHandshakeRequest(remote, local, ['webrtc-media-channel/1', 'future/2'])
        connection.emit('data', Message.toBinary(request))
        expect(capabilitiesAtEmit).toEqual(['webrtc-media-channel/1', 'future/2'])
        handshaker.stop()
    })

    it('a successful response hands the remote capabilities over; a failed one does not', () => {
        const connection = new CapableConnection([])
        const handshaker = new Handshaker(local, connection)
        const completed = jest.fn()
        handshaker.on('handshakeCompleted', completed)
        connection.emit('data', Message.toBinary(createHandshakeResponse(remote, HandshakeError.DUPLICATE_CONNECTION, ['webrtc-media-channel/1'])))
        expect(connection.remoteCapabilities).toBeUndefined()
        connection.emit('data', Message.toBinary(createHandshakeResponse(remote, undefined, ['webrtc-media-channel/1'])))
        expect(connection.remoteCapabilities).toEqual(['webrtc-media-channel/1'])
        expect(completed).toHaveBeenCalledTimes(1)
        handshaker.stop()
    })

    it('a peer that predates the field yields an empty list', () => {
        const connection = new CapableConnection(['webrtc-media-channel/1'])
        const handshaker = new Handshaker(local, connection)
        const response = createHandshakeResponse(remote)
        connection.emit('data', Message.toBinary(response))
        expect(connection.remoteCapabilities).toEqual([])
        handshaker.stop()
    })
})
