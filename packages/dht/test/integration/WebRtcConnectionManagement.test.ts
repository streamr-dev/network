import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { LatencyType, Simulator } from '../../src/connection/Simulator/Simulator'
import { Message, MessageType, NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { PeerID } from '../../src/helpers/PeerID'
import { ConnectionType } from '../../src/connection/IConnection'
import { ITransport } from '../../src/transport/ITransport'
import * as Err from '../../src/helpers/errors'
import { SimulatorTransport } from '../../src/exports'

describe('WebRTC Connection Management', () => {

    let manager1: ConnectionManager
    let manager2: ConnectionManager

    let simulator: Simulator

    const peerDescriptor1: PeerDescriptor = {
        kademliaId: PeerID.fromString("peer1").value,
        nodeName: "peer1",
        type: NodeType.NODEJS,
    }

    const peerDescriptor2: PeerDescriptor = {
        kademliaId: PeerID.fromString("peer2").value,
        nodeName: "peer2",
        type: NodeType.NODEJS,
    }

    let connectorTransport1: ITransport
    let connectorTransport2: ITransport

    beforeEach(async () => {

        simulator = new Simulator(LatencyType.FIXED, 500)

        connectorTransport1 = new SimulatorTransport(peerDescriptor1, simulator)
        manager1 = new ConnectionManager({ transportLayer: connectorTransport1, nodeName: peerDescriptor1.nodeName })

        connectorTransport2 = new SimulatorTransport(peerDescriptor2, simulator)
        manager2 = new ConnectionManager({ transportLayer: connectorTransport2, nodeName: peerDescriptor2.nodeName })

        await manager1.start((_msg) => peerDescriptor1)
        await manager2.start((_msg) => peerDescriptor2)

    })

    afterEach(async () => {
        await manager1.stop()
        await manager2.stop()
        await connectorTransport1.stop()
        await connectorTransport2.stop()
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
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }

        manager2.on('message', (message: Message) => {
            expect(message.messageId).toEqual('mockerer')
            expect(manager1.getConnection(peerDescriptor2)!.connectionType).toEqual(ConnectionType.WEBRTC)
            expect(manager2.getConnection(peerDescriptor1)!.connectionType).toEqual(ConnectionType.WEBRTC)

            done()
        })
        dummyMessage.targetDescriptor = peerDescriptor2
        manager1.send(dummyMessage).catch((e) => {
            throw e
        })
    }, 60000)

    it('Peer2 can open WebRTC Datachannel', (done) => {
        const dummyMessage: Message = {
            serviceId: serviceId,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            }, 
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }
        manager1.on('message', (message: Message) => {
            expect(message.messageId).toEqual('mockerer')
            expect(manager1.getConnection(peerDescriptor2)!.connectionType).toEqual(ConnectionType.WEBRTC)
            expect(manager2.getConnection(peerDescriptor1)!.connectionType).toEqual(ConnectionType.WEBRTC)

            done()
        })
        dummyMessage.targetDescriptor = peerDescriptor1
        manager2.send(dummyMessage)
    }, 60000)

    it('Connecting to self throws', async () => {
        const dummyMessage: Message = {
            serviceId: serviceId,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }
        dummyMessage.targetDescriptor = peerDescriptor1
        await expect(manager1.send(dummyMessage))
            .rejects
            .toEqual(new Err.CannotConnectToSelf('Cannot send to self'))
    })

    it('Connects and disconnects webrtc connections', async () => {
        const msg: Message = {
            serviceId: serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            }
        }

        const dataPromise = new Promise<void>((resolve, _reject) => {
            manager2.on('message', async (message: Message) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        const connectedPromise1 = new Promise<void>((resolve, _reject) => {
            manager1.on('connected', (_peerDescriptor: PeerDescriptor) => {
                //expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        const connectedPromise2 = new Promise<void>((resolve, _reject) => {
            manager2.on('connected', (_peerDescriptor: PeerDescriptor) => {
                resolve()
            })
        })

        const disconnectedPromise1 = new Promise<void>((resolve, _reject) => {
            manager1.on('disconnected', (_peerDescriptor: PeerDescriptor) => {
                resolve()
            })
        })

        const disconnectedPromise2 = new Promise<void>((resolve, _reject) => {
            manager2.on('disconnected', (_peerDescriptor: PeerDescriptor) => {
                resolve()
            })
        })

        msg.targetDescriptor = peerDescriptor2
        manager1.send(msg).catch((_e) => { })

        await Promise.all([dataPromise, connectedPromise1, connectedPromise2])

        // @ts-expect-error private field
        manager1.closeConnection(peerDescriptor2)

        await Promise.all([disconnectedPromise1, disconnectedPromise2])

    }, 20000)

    it('Disconnects webrtcconnection while being connected', async () => {
        const msg: Message = {
            serviceId: serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            },
        }

        const disconnectedPromise1 = new Promise<void>((resolve, _reject) => {
            manager1.on('disconnected', (_peerDescriptor: PeerDescriptor) => {
                resolve()
            })
        })

        msg.targetDescriptor = peerDescriptor2
        manager1.send(msg).catch((e) => {
            expect(e.code).toEqual('CONNECTION_FAILED')
        })

        // @ts-expect-error private field
        manager1.closeConnection(peerDescriptor2)

        await disconnectedPromise1

    }, 20000)
})
