/* eslint-disable max-len */
import { WebsocketConnector } from '../../src/connection/websocket/WebsocketConnector'
import { NodeType } from '../../src/proto/packages/dht/protos/DhtRpc'
import { MockTransport } from '../utils/mock/Transport'
import { createMockPeerDescriptor } from '../utils/utils'

describe('WebsocketConnector', () => {

    describe('isPossibleToFormConnection', () => {

        const connector = new WebsocketConnector({
            transport: new MockTransport(),
            canConnect: () => {}
        } as any)

        it('node without server', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor({ type: NodeType.NODEJS }))
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: false } }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: true } }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS }))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.BROWSER }))).toBe(false)
        })

        it('node with TLS server', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '1.1.1.1', port: 11, tls: true } }))
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: false } }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: true } }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.BROWSER }))).toBe(true)
        })

        it('node with non-TLS server', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '1.1.1.1', port: 11, tls: false } }))
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: false } }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: true } }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.BROWSER }))).toBe(false)
        })

        it('node with non-TLS server in local network', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '192.168.11.11', port: 11, tls: false } }))
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: false } }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: true } }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.BROWSER }))).toBe(true)
        })

        it('browser', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor({ type: NodeType.BROWSER }))
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: false } }))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: true } }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS }))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.BROWSER }))).toBe(false)
        })
    })
})
