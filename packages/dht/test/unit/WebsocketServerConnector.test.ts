/* eslint-disable max-len */
import { WebsocketServerConnector } from '../../src/connection/websocket/WebsocketServerConnector'
import { NodeType } from '../../src/proto/packages/dht/protos/DhtRpc'
import { MockRpcCommunicator } from '../utils/mock/MockRpcCommunicator'
import { createMockPeerDescriptor } from '../utils/utils'

describe('WebsocketServerConnector', () => {

    describe('isPossibleToFormConnection', () => {

        const connector = new WebsocketServerConnector({
            rpcCommunicator: new MockRpcCommunicator(),
            canConnect: () => {}
        } as any)

        it('node without server', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor({ type: NodeType.NODEJS }))
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: false } }))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: true } }))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS }))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.BROWSER }))).toBe(false)
        })

        it('node with TLS server', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '1.1.1.1', port: 11, tls: true } }))
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: false } }))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: true } }))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.BROWSER }))).toBe(true)
        })

        it('node with non-TLS server', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '1.1.1.1', port: 11, tls: false } }))
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: false } }))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: true } }))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.BROWSER }))).toBe(false)
        })

        it('node with non-TLS server in local network', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '192.168.11.11', port: 11, tls: false } }))
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: false } }))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: true } }))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS }))).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.BROWSER }))).toBe(true)
        })

        it('browser', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor({ type: NodeType.BROWSER }))
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: false } }))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '2.2.2.2', port: 22, tls: true } }))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS }))).toBe(false)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.BROWSER }))).toBe(false)
        })
    })
})
