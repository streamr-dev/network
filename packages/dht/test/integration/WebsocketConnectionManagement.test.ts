/* eslint-disable promise/no-nesting */

import { MetricsContext, waitForCondition } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { DefaultConnectorFacade, DefaultConnectorFacadeConfig } from '../../src/connection/ConnectorFacade'
import { ConnectionType } from '../../src/connection/IConnection'
import { Simulator } from '../../src/connection/simulator/Simulator'
import { SimulatorTransport } from '../../src/exports'
import { PeerID } from '../../src/helpers/PeerID'
import * as Err from '../../src/helpers/errors'
import { Message, MessageType, NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'

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

    const serviceId = 'test'
    let wsServerManager: ConnectionManager
    let noWsServerManager: ConnectionManager

    const simulator = new Simulator()

    const wsServerConnectorPeerDescriptor: PeerDescriptor = {
        nodeId: PeerID.fromString('peerWithServer').value,
        type: NodeType.NODEJS,
        websocket: {
            host: '127.0.0.1',
            port: 12223,
            tls: false
        }
    }

    const noWsServerConnectorPeerDescriptor: PeerDescriptor = {
        nodeId: PeerID.fromString('peerWithoutServer').value,
        type: NodeType.NODEJS,
    }

    let connectorTransport1: SimulatorTransport
    let connectorTransport2: SimulatorTransport

    beforeEach(async () => {

        connectorTransport1 = new SimulatorTransport(wsServerConnectorPeerDescriptor, simulator)
        await connectorTransport1.start()
        connectorTransport2 = new SimulatorTransport(noWsServerConnectorPeerDescriptor, simulator)
        await connectorTransport2.start()

        const config1 = createConfig(wsServerConnectorPeerDescriptor, {
            transport: connectorTransport1,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 12223, max: 12223 }
        })
        const config2 = createConfig(noWsServerConnectorPeerDescriptor, {
            transport: connectorTransport2
        })

        wsServerManager = new ConnectionManager(config1)
        noWsServerManager = new ConnectionManager(config2)

        await wsServerManager.start()
        await noWsServerManager.start()
    })

    afterEach(async () => {
        await wsServerManager.stop()
        await noWsServerManager.stop()
        await connectorTransport1.stop()
        await connectorTransport2.stop()
    })

    it('Can open connections to serverless peer', (done) => {
        const dummyMessage: Message = {
            serviceId,
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
            expect(wsServerManager.getConnection(noWsServerConnectorPeerDescriptor)!.connectionType).toEqual(ConnectionType.WEBSOCKET_SERVER)
            expect(noWsServerManager.getConnection(wsServerConnectorPeerDescriptor)!.connectionType).toEqual(ConnectionType.WEBSOCKET_CLIENT)

            done()
        })

        wsServerManager.send(dummyMessage)
    })

    it('Can open connections to peer with server', async () => {
        const dummyMessage: Message = {
            serviceId,
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
                return (!!wsServerManager.getConnection(noWsServerConnectorPeerDescriptor)
                    && wsServerManager.getConnection(noWsServerConnectorPeerDescriptor)!.connectionType === ConnectionType.WEBSOCKET_SERVER)
            }
        )
        await waitForCondition(
            () => noWsServerManager.getConnection(wsServerConnectorPeerDescriptor)!.connectionType === ConnectionType.WEBSOCKET_CLIENT
        )
    })

    it('Connecting to self throws', async () => {
        const dummyMessage: Message = {
            serviceId,
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
