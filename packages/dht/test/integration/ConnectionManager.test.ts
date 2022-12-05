import { ConnectionManager } from "../../src/connection/ConnectionManager"
import { Message, MessageType, NodeType, PeerDescriptor, RpcMessage } from "../../src/proto/DhtRpc"
import { PeerID } from '../../src/helpers/PeerID'
import { Simulator } from '../../src/connection/Simulator/Simulator'
import { DhtNode } from "../../src/dht/DhtNode"
import { v4 } from "uuid"

describe('ConnectionManager', () => {
    const serviceId = 'demo'

    const mockPeerDescriptor1: PeerDescriptor = {
        kademliaId: PeerID.fromString("tester1").value,
        type: NodeType.NODEJS
    }
    const mockPeerDescriptor2: PeerDescriptor = {
        kademliaId: PeerID.fromString("tester2").value,
        type: NodeType.NODEJS
    }

    const mockPeerDescriptor3: PeerDescriptor = {
        kademliaId: PeerID.fromString("tester3").value,
        type: NodeType.NODEJS
    }
    const mockPeerDescriptor4: PeerDescriptor = {
        kademliaId: PeerID.fromString("tester4").value,
        type: NodeType.NODEJS
    }
    const simulator = new Simulator()

    const mockTransport = new ConnectionManager({ ownPeerDescriptor: mockPeerDescriptor1, simulator: simulator })
    const mockConnectorTransport1 = new ConnectionManager({ ownPeerDescriptor: mockPeerDescriptor1, simulator })
    const mockConnectorTransport2 = new ConnectionManager({ ownPeerDescriptor: mockPeerDescriptor2, simulator })

    it('Can start alone', async () => {
        const connectionManager = new ConnectionManager({ transportLayer: mockTransport, webSocketHost: '127.0.0.1', webSocketPort: 9991 })

        await connectionManager.start((report) => {
            expect(report.ip).toEqual('127.0.0.1')
            expect(report.openInternet).toEqual(true)
            return DhtNode.createPeerDescriptor(report)
        })

        await connectionManager.stop()
    })

    it('Throws an async exception if fails to connect to entrypoints', async () => {

        const connectionManager = new ConnectionManager({
            transportLayer: mockTransport,
            webSocketPort: 9992, entryPoints: [
                { kademliaId: Uint8Array.from([1, 2, 3]), type: NodeType.NODEJS, websocket: { ip: '127.0.0.1', port: 12345 } }
            ]
        })

        await expect(connectionManager.start((report) => {
            return DhtNode.createPeerDescriptor(report)
        })).rejects.toThrow('Failed to connect to the entrypoints')

        await connectionManager.stop()
    }, 15000)

    it('Can probe connectivity in open internet', async () => {
        const connectionManager1 = new ConnectionManager({ transportLayer: mockTransport, webSocketHost: '127.0.0.1', webSocketPort: 9993 })

        await connectionManager1.start((report) => {
            expect(report.ip).toEqual('127.0.0.1')
            expect(report.openInternet).toEqual(true)
            return DhtNode.createPeerDescriptor(report)
        })

        const connectionManager2 = new ConnectionManager({
            transportLayer: mockConnectorTransport2,
            webSocketPort: 9994, entryPoints: [
                { kademliaId: Uint8Array.from([1, 2, 3]), type: NodeType.NODEJS, websocket: { ip: '127.0.0.1', port: 9993 } }
            ]
        })

        await connectionManager2.start((report) => {
            expect(report.ip).toEqual('127.0.0.1')
            expect(report.openInternet).toEqual(true)
            return DhtNode.createPeerDescriptor(report)
        })

        await connectionManager1.stop()
        await connectionManager2.stop()
    })

    it('Can send data to other connectionmanager over websocket', async () => {
        const connectionManager1 = new ConnectionManager({ transportLayer: mockConnectorTransport1, webSocketHost: '127.0.0.1', webSocketPort: 9995 })

        let peerDescriptor: PeerDescriptor | undefined

        await connectionManager1.start((report) => {
            expect(report.ip).toEqual('127.0.0.1')
            expect(report.openInternet).toEqual(true)
            peerDescriptor = DhtNode.createPeerDescriptor(report)
            return peerDescriptor
        })

        const connectionManager2 = new ConnectionManager({
            transportLayer: mockConnectorTransport2,
            webSocketPort: 9996, entryPoints: [
                peerDescriptor!
            ]
        })

        let peerDescriptor2: PeerDescriptor | undefined
        await connectionManager2.start((report2) => {
            expect(report2.ip).toEqual('127.0.0.1')
            expect(report2.openInternet).toEqual(true)
            peerDescriptor2 = DhtNode.createPeerDescriptor(report2)
            return peerDescriptor2
        })

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

        const promise = new Promise<void>((resolve, _reject) => {
            connectionManager2.on('message', async (message: Message) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        const connectedPromise1 = new Promise<void>((resolve, _reject) => {
            connectionManager1.on('connected', (_peerDescriptor: PeerDescriptor) => {
                //expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        const connectedPromise2 = new Promise<void>((resolve, _reject) => {
            connectionManager2.on('connected', (_peerDescriptor: PeerDescriptor) => {
                //expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        msg.targetDescriptor = peerDescriptor2
        connectionManager1.send(msg)

        await Promise.all([promise, connectedPromise1, connectedPromise2])

        await connectionManager1.stop()
        await connectionManager2.stop()
    })

    it('Can disconnect websockets', async () => {
        const connectionManager1 = new ConnectionManager({ transportLayer: mockConnectorTransport1, webSocketHost: '127.0.0.1', webSocketPort: 9997 })

        let peerDescriptor: PeerDescriptor | undefined
        await connectionManager1.start((report) => {
            expect(report.ip).toEqual('127.0.0.1')
            expect(report.openInternet).toEqual(true)
            peerDescriptor = DhtNode.createPeerDescriptor(report)
            return peerDescriptor
        })

        const connectionManager2 = new ConnectionManager({
            transportLayer: mockConnectorTransport2,
            webSocketPort: 9999, entryPoints: [
                peerDescriptor!
            ]
        })

        let peerDescriptor2: PeerDescriptor | undefined
        await connectionManager2.start((report2) => {
            peerDescriptor2 = DhtNode.createPeerDescriptor(report2)
            return peerDescriptor2
        })

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
            connectionManager1.on('disconnected', (_peerDescriptor: PeerDescriptor) => {
                //expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        const disconnectedPromise2 = new Promise<void>((resolve, _reject) => {
            connectionManager2.on('disconnected', (_peerDescriptor: PeerDescriptor) => {
                //expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        const promise = new Promise<void>((resolve, _reject) => {
            connectionManager2.on('message', async (message: Message) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })
        msg.targetDescriptor = peerDescriptor2
        connectionManager1.send(msg)
        
        await promise
        
        connectionManager1.disconnect(peerDescriptor2!, undefined, 100)
        await Promise.all([disconnectedPromise1, disconnectedPromise2])
        
        await connectionManager1.stop()
        await connectionManager2.stop()
    })

    it('Connects and disconnects over simulated connections', async () => {
        const simulator2 = new Simulator()
        const connectionManager3 = new ConnectionManager({ ownPeerDescriptor: mockPeerDescriptor3, simulator: simulator2 })
        const connectionManager4 = new ConnectionManager({ ownPeerDescriptor: mockPeerDescriptor4, simulator: simulator2 })

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
            connectionManager4.on('message', async (message: Message) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        const connectedPromise1 = new Promise<void>((resolve, _reject) => {
            connectionManager4.on('connected', (_peerDescriptor: PeerDescriptor) => {
                //expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        const connectedPromise2 = new Promise<void>((resolve, _reject) => {
            connectionManager3.on('connected', (_peerDescriptor: PeerDescriptor) => {
                //expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        const disconnectedPromise1 = new Promise<void>((resolve, _reject) => {
            connectionManager4.on('disconnected', (_peerDescriptor: PeerDescriptor) => {
                //expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        const disconnectedPromise2 = new Promise<void>((resolve, _reject) => {
            connectionManager3.on('disconnected', (_peerDescriptor: PeerDescriptor) => {
                //expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })
        msg.targetDescriptor = mockPeerDescriptor4
        connectionManager3.send(msg)
        await Promise.all([dataPromise, connectedPromise1, connectedPromise2])
        connectionManager3.disconnect(mockPeerDescriptor4!, undefined, 100)
        await Promise.all([disconnectedPromise1, disconnectedPromise2])
    })

    afterAll(async () => {
    })

})
