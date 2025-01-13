import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { LatencyType, Simulator } from '../../src/connection/simulator/Simulator'
import { Message, NodeType, PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../generated/packages/proto-rpc/protos/ProtoRpc'
import { ITransport } from '../../src/transport/ITransport'
import * as Err from '../../src/helpers/errors'
import { SimulatorTransport } from '../../src/connection/simulator/SimulatorTransport'
import { DefaultConnectorFacade } from '../../src/connection/ConnectorFacade'
import { MetricsContext } from '@streamr/utils'
import { createMockPeerDescriptor } from '../utils/utils'

const createConnectionManager = (localPeerDescriptor: PeerDescriptor, transport: ITransport) => {
    return new ConnectionManager({
        createConnectorFacade: () =>
            new DefaultConnectorFacade({
                transport,
                createLocalPeerDescriptor: async () => localPeerDescriptor
            }),
        metricsContext: new MetricsContext(),
        allowIncomingPrivateConnections: false
    })
}

describe('WebRTC Connection Management', () => {
    let manager1: ConnectionManager
    let manager2: ConnectionManager
    let simulator: Simulator
    const peerDescriptor1 = createMockPeerDescriptor()
    const peerDescriptor2 = createMockPeerDescriptor()
    let connectorTransport1: SimulatorTransport
    let connectorTransport2: SimulatorTransport

    beforeEach(async () => {
        simulator = new Simulator(LatencyType.FIXED, 20)
        connectorTransport1 = new SimulatorTransport(peerDescriptor1, simulator)
        await connectorTransport1.start()
        manager1 = createConnectionManager(peerDescriptor1, connectorTransport1)
        connectorTransport2 = new SimulatorTransport(peerDescriptor2, simulator)
        await connectorTransport2.start()
        manager2 = createConnectionManager(peerDescriptor2, connectorTransport2)
        await manager1.start()
        await manager2.start()
    })

    afterEach(async () => {
        await Promise.all([manager1.stop(), manager2.stop(), connectorTransport1.stop(), connectorTransport2.stop()])
        simulator.stop()
    })

    const serviceId = 'dummy'

    // TODO: fix flaky test, ticket NET-911
    it('Peer1 can open WebRTC Datachannels', (done) => {
        const dummyMessage: Message = {
            serviceId: 'unknown',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageId: 'mockerer'
        }

        manager2.on('message', (message: Message) => {
            expect(message.messageId).toEqual('mockerer')

            done()
        })
        dummyMessage.targetDescriptor = peerDescriptor2
        manager1.send(dummyMessage).catch((e) => {
            throw e
        })
    }, 15000)

    it('Peer2 can open WebRTC Datachannel', (done) => {
        const dummyMessage: Message = {
            serviceId,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageId: 'mockerer'
        }
        manager1.on('message', (message: Message) => {
            expect(message.messageId).toEqual('mockerer')
            done()
        })
        dummyMessage.targetDescriptor = peerDescriptor1
        manager2.send(dummyMessage)
    }, 60000)

    it('Connecting to self throws', async () => {
        const dummyMessage: Message = {
            serviceId,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageId: 'mockerer'
        }
        dummyMessage.targetDescriptor = peerDescriptor1
        await expect(manager1.send(dummyMessage)).rejects.toEqual(new Err.CannotConnectToSelf('Cannot send to self'))
    })

    it('Connects and disconnects webrtc connections', async () => {
        const msg: Message = {
            serviceId,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            }
        }

        const dataPromise = new Promise<void>((resolve, _reject) => {
            manager2.on('message', async (message: Message) => {
                expect(message.body.oneofKind).toBe('rpcMessage')
                resolve()
            })
        })

        const connectedPromise1 = new Promise<void>((resolve, _reject) => {
            manager1.on('connected', () => {
                //expect(message.body.oneofKind).toBe('rpcMessage')
                resolve()
            })
        })

        const connectedPromise2 = new Promise<void>((resolve, _reject) => {
            manager2.on('connected', () => {
                resolve()
            })
        })

        const disconnectedPromise1 = new Promise<void>((resolve, _reject) => {
            manager1.on('disconnected', () => {
                resolve()
            })
        })

        const disconnectedPromise2 = new Promise<void>((resolve, _reject) => {
            manager2.on('disconnected', () => {
                resolve()
            })
        })

        msg.targetDescriptor = peerDescriptor2
        manager1.send(msg).catch((_e) => {})

        await Promise.all([dataPromise, connectedPromise1, connectedPromise2])

        // @ts-expect-error private field
        manager1.closeConnection(peerDescriptor2)

        await Promise.all([disconnectedPromise1, disconnectedPromise2])
    }, 20000)

    it('failed connections are cleaned up', async () => {
        const msg: Message = {
            serviceId,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            }
        }

        const disconnectedPromise1 = new Promise<void>((resolve, _reject) => {
            manager1.on('disconnected', () => {
                resolve()
            })
        })

        msg.targetDescriptor = {
            nodeId: new Uint8Array([0, 0, 0, 0, 0]),
            type: NodeType.NODEJS
        }

        await Promise.allSettled([manager1.send(msg), disconnectedPromise1])
    }, 20000)
})
