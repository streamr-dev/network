/* eslint-disable max-len */
import { WebSocketConnector } from '../../src/connection/WebSocket/WebSocketConnector'
import { ConnectivityMethod, NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import crypto from 'crypto'
import { MockTransport } from '../utils/mock/Transport'

const createMockPeerDescriptor = (nodeType: NodeType, websocket?: ConnectivityMethod): PeerDescriptor => {
    return {
        kademliaId: crypto.randomBytes(10),
        type: nodeType,
        websocket
    }
}

describe('WebSocketConnector', () => {

    describe('isPossibleToFormConnection', () => {

        const connector = new WebSocketConnector({
            rpcTransport: new MockTransport(),
            canConnect: () => {}
        } as any)

        it('node without server', () => {
            connector.setOwnPeerDescriptor(createMockPeerDescriptor(NodeType.NODEJS))
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.NODEJS, { host: '2.2.2.2', port: 22, tls: false }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.NODEJS, { host: '2.2.2.2', port: 22, tls: true }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.NODEJS))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.BROWSER))).toBe(false)
        })

        it('node with TLS server', () => {
            connector.setOwnPeerDescriptor(createMockPeerDescriptor(NodeType.NODEJS, { host: '1.1.1.1', port: 11, tls: true }))
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.NODEJS, { host: '2.2.2.2', port: 22, tls: false }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.NODEJS, { host: '2.2.2.2', port: 22, tls: true }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.NODEJS))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.BROWSER))).toBe(true)
        })

        it('node with non-TLS server', () => {
            connector.setOwnPeerDescriptor(createMockPeerDescriptor(NodeType.NODEJS, { host: '1.1.1.1', port: 11, tls: false }))
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.NODEJS, { host: '2.2.2.2', port: 22, tls: false }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.NODEJS, { host: '2.2.2.2', port: 22, tls: true }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.NODEJS))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.BROWSER))).toBe(false)
        })

        it('node with non-TLS server in local network', () => {
            connector.setOwnPeerDescriptor(createMockPeerDescriptor(NodeType.NODEJS, { host: '192.168.11.11', port: 11, tls: false }))
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.NODEJS, { host: '2.2.2.2', port: 22, tls: false }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.NODEJS, { host: '2.2.2.2', port: 22, tls: true }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.NODEJS))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.BROWSER))).toBe(true)
        })

        it('browser', () => {
            connector.setOwnPeerDescriptor(createMockPeerDescriptor(NodeType.BROWSER))
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.NODEJS, { host: '2.2.2.2', port: 22, tls: false }))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.NODEJS, { host: '2.2.2.2', port: 22, tls: true }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.NODEJS))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor(NodeType.BROWSER))).toBe(false)
        })
    })
})
