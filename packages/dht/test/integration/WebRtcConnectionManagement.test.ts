import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { Simulator } from '../../src/connection/Simulator/Simulator'
import { Message, MessageType, NodeType, PeerDescriptor, RpcMessage } from '../../src/proto/DhtRpc'
import { PeerID } from '../../src/helpers/PeerID'
import { ConnectionType } from '../../src/connection/IConnection'
import { ITransport } from '../../src/transport/ITransport'
import * as Err from '../../src/helpers/errors'
import { v4 } from 'uuid'
import { SimulatorTransport } from '../../src/exports'

describe('WebRTC Connection Management', () => {

    let manager1: ConnectionManager
    let manager2: ConnectionManager

    const simulator = new Simulator()

    const peerDescriptor1: PeerDescriptor = {
        peerId: PeerID.fromString("peer1").value,
        type: NodeType.NODEJS,
    }

    const peerDescriptor2: PeerDescriptor = {
        peerId: PeerID.fromString("peer2").value,
        type: NodeType.NODEJS,
    }

    let connectorTransport1: ITransport
    let connectorTransport2: ITransport

    beforeEach(async () => {

        connectorTransport1 = new SimulatorTransport(peerDescriptor1, simulator)
        manager1 = new ConnectionManager({ transportLayer: connectorTransport1 })

        connectorTransport2 = new SimulatorTransport(peerDescriptor2, simulator)
        manager2 = new ConnectionManager({ transportLayer: connectorTransport2 })

        await manager1.start((_msg) => peerDescriptor1)
        await manager2.start((_msg) => peerDescriptor2)

    })

    afterEach(async () => {
        await manager1.stop()
        await manager2.stop()
    })

    const serviceId = 'dummy'

    it('Peer1 can open WebRTC Datachannels', (done) => {
        const dummyMessage: Message = {
            serviceId: 'unknown',
            body: new Uint8Array(),
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
        manager1.send(dummyMessage)
    }, 60000)

    it('Peer2 can open WebRTC Datachannel', (done) => {
        const dummyMessage: Message = {
            serviceId: serviceId,
            body: new Uint8Array(),
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
    })

    it('Connecting to self throws', async () => {
        const dummyMessage: Message = {
            serviceId: serviceId,
            body: new Uint8Array(),
            messageType: MessageType.RPC,
            messageId: 'mockerer'
        }
        dummyMessage.targetDescriptor = peerDescriptor1
        await expect(manager1.send(dummyMessage))
            .rejects
            .toEqual(new Err.CannotConnectToSelf('Cannot send to self'))
    })

    it('Connects and disconnects webrtc connections', async () => {
        
        const rpcMessage: RpcMessage = {
            header: {},
            body: new Uint8Array(10),
            requestId: v4()
        }

        const msg: Message = {
            serviceId: serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            body: RpcMessage.toBinary(rpcMessage)
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
                //expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        const disconnectedPromise1 = new Promise<void>((resolve, _reject) => {
            manager1.on('disconnected', (_peerDescriptor: PeerDescriptor) => {
                //expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        const disconnectedPromise2 = new Promise<void>((resolve, _reject) => {
            manager2.on('disconnected', (_peerDescriptor: PeerDescriptor) => {
                //expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        msg.targetDescriptor = peerDescriptor2
        manager1.send(msg)
        
        await Promise.all([dataPromise, connectedPromise1, connectedPromise2])
        
        manager1.disconnect(peerDescriptor2!, undefined, 100)

        await Promise.all([disconnectedPromise1, disconnectedPromise2])

    }, 20000)

    it('Disconnects webrtcconnection while being connected', async () => {
        
        const rpcMessage: RpcMessage = {
            header: {},
            body: new Uint8Array(10),
            requestId: v4()
        }

        const msg: Message = {
            serviceId: serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            body: RpcMessage.toBinary(rpcMessage)
        }

        const disconnectedPromise1 = new Promise<void>((resolve, _reject) => {
            manager1.on('disconnected', (_peerDescriptor: PeerDescriptor) => {
                //expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        msg.targetDescriptor = peerDescriptor2
        manager1.send(msg)
        
        manager1.disconnect(peerDescriptor2!, undefined, 100)
        await disconnectedPromise1

    }, 20000)
})
