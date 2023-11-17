/* eslint-disable promise/no-nesting */

import { MetricsContext, waitForCondition } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { DefaultConnectorFacade, DefaultConnectorFacadeConfig } from '../../src/connection/ConnectorFacade'
import { ConnectionType } from '../../src/connection/IConnection'
import { Simulator } from '../../src/connection/simulator/Simulator'
import { SimulatorTransport } from '../../src/exports'
import { PeerID } from '../../src/helpers/PeerID'
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

describe('Increased logging', () => {

    const serviceId = 'test'
    let wsServerManager: ConnectionManager
    let noWsServerManager: ConnectionManager

    const simulator = new Simulator()

    const wsServerConnectorPeerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('peerWithServer').value,
        type: NodeType.NODEJS,
        websocket: {
            host: '127.0.0.1',
            port: 12223,
            tls: false
        }
    }

    const noWsServerConnectorPeerDescriptor: PeerDescriptor = {
        kademliaId: PeerID.fromString('peerWithoutServer').value,
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
    
    it('Logs to console.log log if trying to close a destroyed connection', async () => {
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

        const managedConnection = noWsServerManager.getConnection(wsServerConnectorPeerDescriptor)
        managedConnection!.destroy()
        await managedConnection!.send(Message.toBinary(dummyMessage), true)
    })

})
