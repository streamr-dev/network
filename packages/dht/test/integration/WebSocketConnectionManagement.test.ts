import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { Simulator } from '../../src/connection/Simulator'
import { SimulatorTransport } from '../../src/connection/SimulatorTransport'
import { Message, MessageType, NodeType, PeerDescriptor } from '../../src/proto/DhtRpc'
import { PeerID } from '../../src/helpers/PeerID'
import { waitForCondition } from 'streamr-test-utils'
import { ConnectionType } from '../../src/connection/IConnection'
import { ITransport } from '../../src/transport/ITransport'

describe('WebSocket Connection Management', () => {

    const serviceId = 'test'
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

    beforeEach(async () => {

        connectorTransport1 = new SimulatorTransport(wsServerConnectorPeerDescriptor, simulator)
        connectorTransport2 = new SimulatorTransport(noWsServerConnectorPeerDescriptor, simulator)

        const config1 = {
            transportLayer: connectorTransport1,
            webSocketHost: 'localhost',
            webSocketPort: 12223,
        }
        const config2 = {
            transportLayer: connectorTransport2
        }

        wsServerManager = new ConnectionManager(config1)
        noWsServerManager = new ConnectionManager(config2)

        await wsServerManager.start((_response) => wsServerConnectorPeerDescriptor)
        await noWsServerManager.start((_response) => noWsServerConnectorPeerDescriptor)
    })

    afterEach(async () => {
        await wsServerManager.stop()
        await noWsServerManager.stop()
    })

    it('Can open connections to serverless peer', (done) => {
        const dummyMessage: Message = {
            serviceId: serviceId,
            body: new Uint8Array(),
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }
        noWsServerManager.on('DATA', (message: Message, _peerDescriptor: PeerDescriptor) => {
            expect(message.messageId).toEqual('mockerer')
            expect(wsServerManager.getConnection(noWsServerConnectorPeerDescriptor)!.connectionType).toEqual(ConnectionType.WEBSOCKET_SERVER)
            expect(noWsServerManager.getConnection(wsServerConnectorPeerDescriptor)!.connectionType).toEqual(ConnectionType.WEBSOCKET_CLIENT)

            done()
        })

        wsServerManager.send(dummyMessage, noWsServerConnectorPeerDescriptor)
    })

    it('Can open connections to peer with server', async () => {
        const dummyMessage: Message = {
            serviceId: serviceId,
            body: new Uint8Array(),
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }
        await noWsServerManager.send(dummyMessage, wsServerConnectorPeerDescriptor)
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

    it('Connecting to self throws', (done) => {
        const dummyMessage: Message = {
            serviceId: serviceId,
            body: new Uint8Array(),
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }
        noWsServerManager.send(dummyMessage, noWsServerConnectorPeerDescriptor)
            .then(() => {
                done.fail('test did not throw as expected')
                return
            })
            .catch((e) => {
                expect(e.message).toEqual('Cannot send to self')
                wsServerManager.send(dummyMessage, wsServerConnectorPeerDescriptor)
                    .then(() => {
                        done.fail('test did not throw as expected')
                        return
                    })
                    .catch((e) => {
                        expect(e.message).toEqual('Cannot send to self')
                        done()
                    })
            })
    })
})
