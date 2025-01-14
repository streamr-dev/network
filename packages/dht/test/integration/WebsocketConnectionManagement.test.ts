import { MetricsContext, until, waitForEvent3 } from '@streamr/utils'
import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { DefaultConnectorFacade, DefaultConnectorFacadeOptions } from '../../src/connection/ConnectorFacade'
import { Simulator } from '../../src/connection/simulator/Simulator'
import { SimulatorTransport } from '../../src/connection/simulator/SimulatorTransport'
import * as Err from '../../src/helpers/errors'
import { Message, NodeType, PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../generated/packages/proto-rpc/protos/ProtoRpc'
import { TransportEvents } from '../../src/transport/ITransport'
import { toNodeId } from '../../src/identifiers'

const SERVICE_ID = 'test'

const createOptions = (
    localPeerDescriptor: PeerDescriptor,
    opts: Omit<DefaultConnectorFacadeOptions, 'createLocalPeerDescriptor'>
) => {
    return {
        createConnectorFacade: () =>
            new DefaultConnectorFacade({
                createLocalPeerDescriptor: async () => localPeerDescriptor,
                ...opts
            }),
        metricsContext: new MetricsContext(),
        allowIncomingPrivateConnections: false
    }
}

describe('Websocket Connection Management', () => {
    let wsServerManager: ConnectionManager
    let noWsServerManager: ConnectionManager
    let biggerNoWsServerManager: ConnectionManager
    const simulator = new Simulator()
    const wsServerConnectorPeerDescriptor: PeerDescriptor = {
        nodeId: new Uint8Array([2]),
        type: NodeType.NODEJS,
        websocket: {
            host: '127.0.0.1',
            port: 12223,
            tls: false
        }
    }
    const noWsServerConnectorPeerDescriptor: PeerDescriptor = {
        nodeId: new Uint8Array([1]),
        type: NodeType.NODEJS
    }
    const biggerNoWsServerConnectorPeerDescriptor: PeerDescriptor = {
        nodeId: new Uint8Array([3]),
        type: NodeType.NODEJS
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

        const options1 = createOptions(wsServerConnectorPeerDescriptor, {
            transport: connectorTransport1,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 12223, max: 12223 }
        })
        const options2 = createOptions(noWsServerConnectorPeerDescriptor, {
            transport: connectorTransport2
        })
        const options3 = createOptions(biggerNoWsServerConnectorPeerDescriptor, {
            transport: connectorTransport3
        })

        wsServerManager = new ConnectionManager(options1)
        noWsServerManager = new ConnectionManager(options2)
        biggerNoWsServerManager = new ConnectionManager(options3)

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

    it('Can open connections to serverless peer with smaller nodeId', (done) => {
        const dummyMessage: Message = {
            serviceId: SERVICE_ID,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageId: 'mockerer',
            targetDescriptor: noWsServerConnectorPeerDescriptor
        }
        noWsServerManager.on('message', (message: Message) => {
            expect(message.messageId).toEqual('mockerer')

            done()
        })

        wsServerManager.send(dummyMessage)
    })

    it('Can open connections to serverless peer with bigger nodeId', (done) => {
        const dummyMessage: Message = {
            serviceId: SERVICE_ID,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageId: 'mockerer',
            targetDescriptor: biggerNoWsServerConnectorPeerDescriptor
        }
        biggerNoWsServerManager.on('message', (message: Message) => {
            expect(message.messageId).toEqual('mockerer')
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
        expect(wsServerManager.hasConnection(toNodeId(dummyMessage.targetDescriptor!))).toBeFalse()
    }, 20000)

    it('Can open connections to peer with server', async () => {
        const dummyMessage: Message = {
            serviceId: SERVICE_ID,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageId: 'mockerer',
            targetDescriptor: wsServerConnectorPeerDescriptor
        }
        await noWsServerManager.send(dummyMessage)
        await until(() => {
            const nodeId = toNodeId(noWsServerConnectorPeerDescriptor)
            return wsServerManager.hasConnection(nodeId)
        })
        await until(() => noWsServerManager.hasConnection(toNodeId(wsServerConnectorPeerDescriptor)))
    })

    it('Connecting to self throws', async () => {
        const dummyMessage: Message = {
            serviceId: SERVICE_ID,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageId: 'mockerer',
            targetDescriptor: noWsServerConnectorPeerDescriptor
        }
        await expect(noWsServerManager.send(dummyMessage)).rejects.toEqual(
            new Err.CannotConnectToSelf('Cannot send to self')
        )

        dummyMessage.targetDescriptor = wsServerConnectorPeerDescriptor
        await expect(wsServerManager.send(dummyMessage)).rejects.toEqual(
            new Err.CannotConnectToSelf('Cannot send to self')
        )
    })
})
