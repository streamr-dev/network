import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { Simulator } from '../../src/connection/Simulator'
import { MockConnectionManager } from '../../src/connection/MockConnectionManager'
import { Message, MessageType, NodeType, PeerDescriptor } from '../../src/proto/DhtRpc'
import { PeerID } from '../../src/PeerID'
import { waitForCondition } from 'streamr-test-utils'
import { ConnectionType } from '../../src/connection/IConnection'
import { ITransport } from '../../src/transport/ITransport'
import { RpcCommunicator } from '../../src/transport/RpcCommunicator'

describe('WebSocket Connection Management', () => {

    let wsServerManager: ConnectionManager
    let noWsServerManager: ConnectionManager

    const simulator = new Simulator()

    const wsServerConnectorPeerDescriptor: PeerDescriptor = {
        peerId: PeerID.fromString("peerWithServer").value,
        type: NodeType.NODEJS,
        websocket: {
            ip: 'localhost',
            port: 12223
        }
    }

    const noWsServerConnectorPeerDescriptor: PeerDescriptor = {
        peerId: PeerID.fromString("peerWithoutServer").value,
        type: NodeType.NODEJS,
    }

    let connectorTransport1: ITransport
    let connectorTransport2: ITransport

    let connectorRpc1: RpcCommunicator
    let connectorRpc2: RpcCommunicator

    beforeEach(async () => {

        connectorTransport1 = new MockConnectionManager(wsServerConnectorPeerDescriptor , simulator)
        connectorTransport2 = new MockConnectionManager(noWsServerConnectorPeerDescriptor, simulator)

        connectorRpc1 = new RpcCommunicator({
            rpcRequestTimeout: 10000,
            appId: "websocket",
            connectionLayer: connectorTransport1
        })

        connectorRpc2 = new RpcCommunicator({
            rpcRequestTimeout: 10000,
            appId: "websocket",
            connectionLayer: connectorTransport2
        })
        connectorRpc1.setSendFn((_targetPeer, message) => {
            connectorRpc2.onIncomingMessage(wsServerConnectorPeerDescriptor, message)
        })
        connectorRpc2.setSendFn((_targetPeer, message) => {
            connectorRpc1.onIncomingMessage(noWsServerConnectorPeerDescriptor, message)
        })

        const config1 = {
            webSocketHost: 'localhost',
            webSocketPort: 12223,
        }
        const config2 = {
        }

        wsServerManager = new ConnectionManager(config1)
        noWsServerManager = new ConnectionManager(config2)

        wsServerManager.createWsConnector(connectorTransport1, connectorRpc1)
        noWsServerManager.createWsConnector(connectorTransport2, connectorRpc2)

        await wsServerManager.start()
        await noWsServerManager.start()

        wsServerManager.enableConnectivity(wsServerConnectorPeerDescriptor)
        noWsServerManager.enableConnectivity(noWsServerConnectorPeerDescriptor)
    })

    afterEach(async () => {
        await wsServerManager.stop()
        await noWsServerManager.stop()
    })

    it('Can open connections to serverless peer', async () => {
        const dummyMessage: Message = {
            body: new Uint8Array(),
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }
        await wsServerManager.send(noWsServerConnectorPeerDescriptor, dummyMessage)
        await waitForCondition(
            () => {
                return (!!wsServerManager.getConnection(noWsServerConnectorPeerDescriptor)
                    && wsServerManager.getConnection(noWsServerConnectorPeerDescriptor)!.connectionType === ConnectionType.WEBSOCKET_SERVER)
            }
        )
        await waitForCondition(
            () => noWsServerManager.getConnection(wsServerConnectorPeerDescriptor)!.connectionType === ConnectionType.WEBSOCKET_CLIENT
        )
    })

    it('Can open connections to peer with server', async () => {
        const dummyMessage: Message = {
            body: new Uint8Array(),
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }
        await noWsServerManager.send(wsServerConnectorPeerDescriptor, dummyMessage)
        await waitForCondition(
            () => {
                return (!!wsServerManager.getConnection(noWsServerConnectorPeerDescriptor)
                    && wsServerManager.getConnection(noWsServerConnectorPeerDescriptor)!.connectionType === ConnectionType.WEBSOCKET_SERVER)
            }
        )
        await waitForCondition(
            () => noWsServerManager.getConnection(wsServerConnectorPeerDescriptor)!.connectionType === ConnectionType.WEBSOCKET_CLIENT
        )
    })
})