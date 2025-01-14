import { WebsocketClientConnector } from '../../src/connection/websocket/WebsocketClientConnector'
import { NodeType } from '../../generated/packages/dht/protos/DhtRpc'
import { MockConnection } from '../utils/mock/MockConnection'
import { MockRpcCommunicator } from '../utils/mock/MockRpcCommunicator'
import { createMockPeerDescriptor } from '../utils/utils'

describe('WebsocketClientConnector', () => {
    let connector: WebsocketClientConnector

    beforeEach(() => {
        connector = new WebsocketClientConnector({
            rpcCommunicator: new MockRpcCommunicator(),
            canConnect: () => {}
        } as any)
    })

    afterEach(() => {
        connector.destroy()
    })

    describe('isPossibleToFormConnection', () => {
        it('node without server', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor({ type: NodeType.NODEJS }))
            expect(
                connector.isPossibleToFormConnection(
                    createMockPeerDescriptor({
                        type: NodeType.NODEJS,
                        websocket: { host: '2.2.2.2', port: 22, tls: false }
                    })
                )
            ).toBe(true)
            expect(
                connector.isPossibleToFormConnection(
                    createMockPeerDescriptor({
                        type: NodeType.NODEJS,
                        websocket: { host: '2.2.2.2', port: 22, tls: true }
                    })
                )
            ).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS }))).toBe(
                false
            )
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.BROWSER }))).toBe(
                false
            )
        })

        it('node with TLS server', () => {
            connector.setLocalPeerDescriptor(
                createMockPeerDescriptor({ type: NodeType.NODEJS, websocket: { host: '1.1.1.1', port: 11, tls: true } })
            )
            expect(
                connector.isPossibleToFormConnection(
                    createMockPeerDescriptor({
                        type: NodeType.NODEJS,
                        websocket: { host: '2.2.2.2', port: 22, tls: false }
                    })
                )
            ).toBe(true)
            expect(
                connector.isPossibleToFormConnection(
                    createMockPeerDescriptor({
                        type: NodeType.NODEJS,
                        websocket: { host: '2.2.2.2', port: 22, tls: true }
                    })
                )
            ).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS }))).toBe(
                false
            )
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.BROWSER }))).toBe(
                false
            )
        })

        it('node with non-TLS server', () => {
            connector.setLocalPeerDescriptor(
                createMockPeerDescriptor({
                    type: NodeType.NODEJS,
                    websocket: { host: '1.1.1.1', port: 11, tls: false }
                })
            )
            expect(
                connector.isPossibleToFormConnection(
                    createMockPeerDescriptor({
                        type: NodeType.NODEJS,
                        websocket: { host: '2.2.2.2', port: 22, tls: false }
                    })
                )
            ).toBe(true)
            expect(
                connector.isPossibleToFormConnection(
                    createMockPeerDescriptor({
                        type: NodeType.NODEJS,
                        websocket: { host: '2.2.2.2', port: 22, tls: true }
                    })
                )
            ).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS }))).toBe(
                false
            )
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.BROWSER }))).toBe(
                false
            )
        })

        it('node with non-TLS server in local network', () => {
            connector.setLocalPeerDescriptor(
                createMockPeerDescriptor({
                    type: NodeType.NODEJS,
                    websocket: { host: '192.168.11.11', port: 11, tls: false }
                })
            )
            expect(
                connector.isPossibleToFormConnection(
                    createMockPeerDescriptor({
                        type: NodeType.NODEJS,
                        websocket: { host: '2.2.2.2', port: 22, tls: false }
                    })
                )
            ).toBe(true)
            expect(
                connector.isPossibleToFormConnection(
                    createMockPeerDescriptor({
                        type: NodeType.NODEJS,
                        websocket: { host: '2.2.2.2', port: 22, tls: true }
                    })
                )
            ).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS }))).toBe(
                false
            )
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.BROWSER }))).toBe(
                false
            )
        })

        it('browser', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor({ type: NodeType.BROWSER }))
            expect(
                connector.isPossibleToFormConnection(
                    createMockPeerDescriptor({
                        type: NodeType.NODEJS,
                        websocket: { host: '2.2.2.2', port: 22, tls: false }
                    })
                )
            ).toBe(false)
            expect(
                connector.isPossibleToFormConnection(
                    createMockPeerDescriptor({
                        type: NodeType.NODEJS,
                        websocket: { host: '2.2.2.2', port: 22, tls: true }
                    })
                )
            ).toBe(true)
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.NODEJS }))).toBe(
                false
            )
            expect(connector.isPossibleToFormConnection(createMockPeerDescriptor({ type: NodeType.BROWSER }))).toBe(
                false
            )
        })
    })

    describe('Connect', () => {
        it('Returns existing connecting connection', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor())
            const remotePeerDescriptor = createMockPeerDescriptor({
                type: NodeType.NODEJS,
                websocket: { host: '1.1.1.1', port: 11, tls: false }
            })
            const firstConnection = connector.connect(remotePeerDescriptor)
            const secondConnection = connector.connect(remotePeerDescriptor)
            expect(firstConnection).toEqual(secondConnection)
            firstConnection.close(false)
        })

        it('Disconnected event removes connecting connection', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor())
            const remotePeerDescriptor = createMockPeerDescriptor({
                type: NodeType.NODEJS,
                websocket: { host: '1.1.1.1', port: 11, tls: false }
            })
            const firstConnection = connector.connect(remotePeerDescriptor)
            firstConnection.emit('disconnected', false)
            const secondConnection = connector.connect(remotePeerDescriptor)
            expect(firstConnection).not.toEqual(secondConnection)
            firstConnection.close(false)
            secondConnection.close(false)
        })

        it('Connected event removes connecting connection', () => {
            connector.setLocalPeerDescriptor(createMockPeerDescriptor())
            const remotePeerDescriptor = createMockPeerDescriptor({
                type: NodeType.NODEJS,
                websocket: { host: '1.1.1.1', port: 11, tls: false }
            })
            const firstConnection = connector.connect(remotePeerDescriptor)
            firstConnection.onHandshakeCompleted(new MockConnection())
            const secondConnection = connector.connect(remotePeerDescriptor)
            expect(firstConnection).not.toEqual(secondConnection)
            firstConnection.close(false)
            secondConnection.close(false)
        })
    })
})
