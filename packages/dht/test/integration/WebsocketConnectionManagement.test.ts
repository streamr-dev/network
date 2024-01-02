/* eslint-disable promise/no-nesting */

import { MetricsContext, waitForCondition, waitForEvent3 } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { DefaultConnectorFacade, DefaultConnectorFacadeConfig } from '../../src/connection/ConnectorFacade'
import { ConnectionType } from '../../src/connection/IConnection'
import { Simulator } from '../../src/connection/simulator/Simulator'
import { SimulatorTransport } from '../../src/exports'
import { PeerID } from '../../src/helpers/PeerID'
import * as Err from '../../src/helpers/errors'
import { Message, MessageType, NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { TransportEvents } from '../../src/transport/ITransport'
import { getNodeIdFromPeerDescriptor } from '../../src/helpers/peerIdFromPeerDescriptor'

const SERVICE_ID = 'test'

const createConfig = (localPeerDescriptor: PeerDescriptor, opts: Omit<DefaultConnectorFacadeConfig, 'createLocalPeerDescriptor'>) => {
    return {
        createConnectorFacade: () => new DefaultConnectorFacade({
            createLocalPeerDescriptor: () => localPeerDescriptor,
            ...opts
        }),
        metricsContext: new MetricsContext()
    }
}

describe('Websocket Connection Management', () => {

    let wsServerManager: ConnectionManager
    let noWsServerManager: ConnectionManager
    let biggerNoWsServerManager: ConnectionManager
    const simulator = new Simulator()
    const wsServerConnectorPeerDescriptor: PeerDescriptor = {
        nodeId: PeerID.fromString('2').value,
        type: NodeType.NODEJS,
        websocket: {
            host: '127.0.0.1',
            port: 12223,
            tls: false
        }
    }
    const noWsServerConnectorPeerDescriptor: PeerDescriptor = {
        nodeId: PeerID.fromString('1').value,
        type: NodeType.NODEJS,
    }
    const biggerNoWsServerConnectorPeerDescriptor: PeerDescriptor = {
        nodeId: PeerID.fromString('3').value,
        type: NodeType.NODEJS,
    }

    let connectorTransport1: SimulatorTransport
    let connectorTransport2: SimulatorTransport
    let connectorTransport3: SimulatorTransport

    beforeEach(async () => {

        connectorTransport1 = new SimulatorTransport(wsServerConnectorPeerDescriptor, simulator)
        await connectorTransport1.start()
        connectorTransport2 = new SimulatorTransport(noWsServerConnectorPeerDescriptor, simulator)
        await connectorTransport2.start()
        connectorTransport3 = new SimulatorTransport(biggerNoWsServerConnectorPeerDescriptor, simulator)
        await connectorTransport3.start()

        const config1 = createConfig(wsServerConnectorPeerDescriptor, {
            transport: connectorTransport1,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 12223, max: 12223 }
        })
        const config2 = createConfig(noWsServerConnectorPeerDescriptor, {
            transport: connectorTransport2
        })
        const config3 = createConfig(biggerNoWsServerConnectorPeerDescriptor, {
            transport: connectorTransport3
        })

        wsServerManager = new ConnectionManager(config1)
        noWsServerManager = new ConnectionManager(config2)
        biggerNoWsServerManager = new ConnectionManager(config3)

        await wsServerManager.start()
        await noWsServerManager.start()
        await biggerNoWsServerManager.start()
    })

    afterEach(async () => {
        await wsServerManager.stop()
        await noWsServerManager.stop()
        await biggerNoWsServerManager.stop()
        await connectorTransport1.stop()
        await connectorTransport2.stop()
        await connectorTransport3.stop()
    })

    it('Can open connections to serverless peer with smaller peerId', (done) => {
        const dummyMessage: Message = {
            serviceId: SERVICE_ID,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageType: MessageType.RPC,
            messageId: 'mockerer',
            targetDescriptor: noWsServerConnectorPeerDescriptor
        }
        noWsServerManager.on('message', (message: Message) => {
            expect(message.messageId).toEqual('mockerer')
            expect(wsServerManager.getConnection(getNodeIdFromPeerDescriptor(noWsServerConnectorPeerDescriptor))!.connectionType).toEqual(
                ConnectionType.WEBSOCKET_SERVER
            )
            expect(noWsServerManager.getConnection(getNodeIdFromPeerDescriptor(wsServerConnectorPeerDescriptor))!.connectionType).toEqual(
                ConnectionType.WEBSOCKET_CLIENT
            )

            done()
        })

        wsServerManager.send(dummyMessage)
    })

    it('Can open connections to serverless peer with bigger peerId', (done) => {
        const dummyMessage: Message = {
            serviceId: SERVICE_ID,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageType: MessageType.RPC,
            messageId: 'mockerer',
            targetDescriptor: biggerNoWsServerConnectorPeerDescriptor
        }
        biggerNoWsServerManager.on('message', (message: Message) => {
            expect(message.messageId).toEqual('mockerer')
            expect(wsServerManager.getConnection(getNodeIdFromPeerDescriptor(biggerNoWsServerConnectorPeerDescriptor))!.connectionType).toEqual(
                ConnectionType.WEBSOCKET_SERVER
            )
            expect(biggerNoWsServerManager.getConnection(getNodeIdFromPeerDescriptor(wsServerConnectorPeerDescriptor))!.connectionType).toEqual(
                ConnectionType.WEBSOCKET_CLIENT
            )

            done()
        })

        wsServerManager.send(dummyMessage)
    })

    it('Failed connection requests are cleaned up', async () => {
        const dummyMessage: Message = {
            serviceId: SERVICE_ID,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageType: MessageType.RPC,
            messageId: 'mockerer',
            targetDescriptor: {
                nodeId: new Uint8Array([1, 2, 4]),
                type: NodeType.NODEJS
            }
        }

        await Promise.allSettled([
            waitForEvent3<TransportEvents>(wsServerManager, 'disconnected', 15000),
            wsServerManager.send(dummyMessage)
        ])
        expect(wsServerManager.getConnection(getNodeIdFromPeerDescriptor(dummyMessage.targetDescriptor!))).toBeUndefined()
    }, 20000)
    
    it('Can open connections to peer with server', async () => {
        const dummyMessage: Message = {
            serviceId: SERVICE_ID,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageType: MessageType.RPC,
            messageId: 'mockerer',
            targetDescriptor: wsServerConnectorPeerDescriptor
        }
        await noWsServerManager.send(dummyMessage)
        await waitForCondition(
            () => {
                const nodeId = getNodeIdFromPeerDescriptor(noWsServerConnectorPeerDescriptor)
                return (!!wsServerManager.getConnection(nodeId)
                    && wsServerManager.getConnection(nodeId)!.connectionType === ConnectionType.WEBSOCKET_SERVER)
            }
        )
        await waitForCondition(
            () => {
                const connection = noWsServerManager.getConnection(getNodeIdFromPeerDescriptor(wsServerConnectorPeerDescriptor))!
                return connection.connectionType === ConnectionType.WEBSOCKET_CLIENT
            }
        )
    })

    it('Connecting to self throws', async () => {
        const dummyMessage: Message = {
            serviceId: SERVICE_ID,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageType: MessageType.RPC,
            messageId: 'mockerer',
            targetDescriptor: noWsServerConnectorPeerDescriptor
        }
        await expect(noWsServerManager.send(dummyMessage))
            .rejects
            .toEqual(new Err.CannotConnectToSelf('Cannot send to self'))

        dummyMessage.targetDescriptor = wsServerConnectorPeerDescriptor
        await expect(wsServerManager.send(dummyMessage))
            .rejects
            .toEqual(new Err.CannotConnectToSelf('Cannot send to self'))
    })
})
