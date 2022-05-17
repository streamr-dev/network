import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { Simulator } from '../../src/connection/Simulator'
import { createMockConnectionDhtNode, createPeerDescriptor } from '../utils'
import { MockConnectionManager } from '../../src/connection/MockConnectionManager'
import { Message, MessageType, NodeType, PeerDescriptor } from '../../src/proto/DhtRpc'
import { PeerID } from '../../src/PeerID'
import { waitForCondition } from 'streamr-test-utils'
import { ConnectionType } from '../../src/connection/IConnection'
import { ITransport } from '../../src/transport/ITransport'
import { DhtNode } from '../../src/dht/DhtNode'

describe('WebSocket Connection Management', () => {
    let epManager: ConnectionManager

    let wsServerManager: ConnectionManager
    let noWsServerManager: ConnectionManager

    const simulator = new Simulator()

    const epPeerDescriptor: PeerDescriptor = {
        peerId: PeerID.fromString("entrypoint").value,
        type: NodeType.NODEJS,
        websocket: {
            ip: 'localhost',
            port: 12222
        }
    }
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

    let epMockTransport: ITransport
    let connectorTransport1: DhtNode
    let connectorTransport2: DhtNode

    beforeEach(async () => {

        epMockTransport = new MockConnectionManager(epPeerDescriptor, simulator)
        epManager = new ConnectionManager({ webSocketHost: 'localhost', webSocketPort: epPeerDescriptor.websocket!.port })

        epManager.createWsConnector(epMockTransport)
        await epManager.start()
        epManager.enableConnectivity(epPeerDescriptor)

        connectorTransport1 = await createMockConnectionDhtNode(PeerID.fromValue(wsServerConnectorPeerDescriptor.peerId).toString(), simulator)
        connectorTransport2 = await createMockConnectionDhtNode(PeerID.fromValue(noWsServerConnectorPeerDescriptor.peerId).toString(), simulator)

        await connectorTransport1.start()
        await connectorTransport2.start()

        await connectorTransport1.joinDht(epPeerDescriptor)
        await connectorTransport2.joinDht(epPeerDescriptor)

        const config1 = {
            entryPoints: [epPeerDescriptor],
            webSocketHost: 'localhost',
            webSocketPort: 12223,
        }
        const config2 = {
            entryPoints: [epPeerDescriptor]
        }

        wsServerManager = new ConnectionManager(config1)
        noWsServerManager = new ConnectionManager(config2)

        wsServerManager.createWsConnector(connectorTransport1)
        noWsServerManager.createWsConnector(connectorTransport2)

        await wsServerManager.start()
        await noWsServerManager.start()
        wsServerManager.enableConnectivity(wsServerConnectorPeerDescriptor)
        noWsServerManager.enableConnectivity(noWsServerConnectorPeerDescriptor)
    })

    afterEach(() => {

    })

    it('Can open connections to serverless peer', async () => {
        const dummyMessage: Message = {
            body: new Uint8Array(),
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }
        await wsServerManager.send(noWsServerConnectorPeerDescriptor, dummyMessage)
        await waitForCondition(() => wsServerManager.getConnection(noWsServerConnectorPeerDescriptor)!.connectionType === ConnectionType.WEBSOCKET_SERVER)
    })
})