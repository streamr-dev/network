import { ConnectionManager } from '../../src/connection/ConnectionManager'
import { Message, MessageType, NodeType, PeerDescriptor } from '../../src/proto/packages/dht/protos/DhtRpc'
import { PeerID } from '../../src/helpers/PeerID'
import { Simulator } from '../../src/connection/Simulator/Simulator'
import { createPeerDescriptor } from '../../src/dht/DhtNode'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { Logger, waitForEvent3 } from '@streamr/utils'

const logger = new Logger(module)

// TODO: refactor this test file to use beforeEach and AfterEach for proper teardown
describe('ConnectionManager', () => {
    const serviceId = 'demo'

    const mockPeerDescriptor1: PeerDescriptor = {
        kademliaId: PeerID.fromString('tester1').value,
        nodeName: 'tester1',
        type: NodeType.NODEJS
    }
    const mockPeerDescriptor2: PeerDescriptor = {
        kademliaId: PeerID.fromString('tester2').value,
        nodeName: 'tester2',
        type: NodeType.NODEJS
    }

    const mockPeerDescriptor3: PeerDescriptor = {
        kademliaId: PeerID.fromString('tester3').value,
        nodeName: 'tester3',
        type: NodeType.NODEJS
    }
    const mockPeerDescriptor4: PeerDescriptor = {
        kademliaId: PeerID.fromString('tester4').value,
        nodeName: 'tester4',
        type: NodeType.NODEJS
    }
    const simulator = new Simulator()

    const mockTransport = new ConnectionManager({ ownPeerDescriptor: mockPeerDescriptor1, simulator: simulator })
    const mockConnectorTransport1 = new ConnectionManager({ ownPeerDescriptor: mockPeerDescriptor1, simulator })
    const mockConnectorTransport2 = new ConnectionManager({ ownPeerDescriptor: mockPeerDescriptor2, simulator })

    afterAll(async ()=> {
        await mockTransport.stop()
        await mockConnectorTransport1.stop()
        await mockConnectorTransport2.stop()
    })

    it('Can start alone', async () => {
        const connectionManager = new ConnectionManager({
            transportLayer: mockTransport,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 9991, max: 9991 }
        })

        await connectionManager.start((report) => {
            expect(report.host).toEqual('127.0.0.1')
            expect(report.openInternet).toEqual(true)
            return createPeerDescriptor(report)
        })

        await connectionManager.stop()
    })

    it('Throws an async exception if fails to connect to entrypoints', async () => {

        const connectionManager = new ConnectionManager({
            transportLayer: mockTransport,
            websocketPortRange: { min: 9992, max: 9992 },
            entryPoints: [
                { kademliaId: Uint8Array.from([1, 2, 3]), type: NodeType.NODEJS, websocket: { host: '127.0.0.1', port: 12345, tls: false } }
            ]
        })

        await expect(connectionManager.start((report) => {
            return createPeerDescriptor(report)
        })).rejects.toThrow('Failed to connect to the entrypoints')

        await connectionManager.stop()
    }, 15000)

    it('Can probe connectivity in open internet', async () => {
        const connectionManager1 = new ConnectionManager({
            transportLayer: mockTransport,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 9993, max: 9993 }
        })

        await connectionManager1.start((report) => {
            expect(report.host).toEqual('127.0.0.1')
            expect(report.openInternet).toEqual(true)
            return createPeerDescriptor(report)
        })

        const connectionManager2 = new ConnectionManager({
            transportLayer: mockConnectorTransport2,
            websocketPortRange: { min: 9994, max: 9994 },
            entryPoints: [
                { kademliaId: Uint8Array.from([1, 2, 3]), type: NodeType.NODEJS, websocket: { host: '127.0.0.1', port: 9993, tls: false } }
            ]
        })

        await connectionManager2.start((report) => {
            expect(report.host).toEqual('127.0.0.1')
            expect(report.openInternet).toEqual(true)
            return createPeerDescriptor(report)
        })

        await connectionManager1.stop()
        await connectionManager2.stop()
    })

    it('Can send data to other connectionmanager over websocket', async () => {
        const connectionManager1 = new ConnectionManager({
            transportLayer: mockConnectorTransport1,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 9995, max: 9995 }
        })

        let peerDescriptor: PeerDescriptor | undefined

        await connectionManager1.start((report) => {
            expect(report.host).toEqual('127.0.0.1')
            expect(report.openInternet).toEqual(true)
            peerDescriptor = createPeerDescriptor(report)
            return peerDescriptor
        })

        const connectionManager2 = new ConnectionManager({
            transportLayer: mockConnectorTransport2,
            websocketPortRange: { min: 9996, max: 9996 },
            entryPoints: [
                peerDescriptor!
            ]
        })

        let peerDescriptor2: PeerDescriptor | undefined
        await connectionManager2.start((report2) => {
            expect(report2.host).toEqual('127.0.0.1')
            expect(report2.openInternet).toEqual(true)
            peerDescriptor2 = createPeerDescriptor(report2)
            return peerDescriptor2
        })

        const msg: Message = {
            serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            } 
        }

        const promise = new Promise<void>((resolve, _reject) => {
            connectionManager2.on('message', async (message: Message) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        const connectedPromise1 = new Promise<void>((resolve, _reject) => {
            connectionManager1.on('connected', (_peerDescriptor: PeerDescriptor) => {
                resolve()
            })
        })

        const connectedPromise2 = new Promise<void>((resolve, _reject) => {
            connectionManager2.on('connected', (_peerDescriptor: PeerDescriptor) => {
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
        const connectionManager1 = new ConnectionManager({ 
            transportLayer: mockConnectorTransport1,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 9997, max: 9997 }
        })

        let peerDescriptor: PeerDescriptor | undefined
        await connectionManager1.start((report) => {
            expect(report.host).toEqual('127.0.0.1')
            expect(report.openInternet).toEqual(true)
            peerDescriptor = createPeerDescriptor(report)
            return peerDescriptor
        })

        const connectionManager2 = new ConnectionManager({
            transportLayer: mockConnectorTransport2,
            websocketPortRange: { min: 9999, max: 9999 },
            entryPoints: [
                peerDescriptor!
            ]
        })

        let peerDescriptor2: PeerDescriptor | undefined
        await connectionManager2.start((report2) => {
            peerDescriptor2 = createPeerDescriptor(report2)
            return peerDescriptor2
        })

        const msg: Message = {
            serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            } 
        }

        const disconnectedPromise1 = new Promise<void>((resolve, _reject) => {
            connectionManager1.on('disconnected', (_peerDescriptor: PeerDescriptor) => {
                logger.info('disconnectedPromise1')
                resolve()
            })
        })

        const disconnectedPromise2 = new Promise<void>((resolve, _reject) => {
            connectionManager2.on('disconnected', (_peerDescriptor: PeerDescriptor) => {
                logger.info('disconnectedPromise2')
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

        // @ts-expect-error private field
        connectionManager1.closeConnection(peerDescriptor2)

        await Promise.all([disconnectedPromise1, disconnectedPromise2])

        await connectionManager1.stop()
        await connectionManager2.stop()
    })

    it('Connects and disconnects over simulated connections', async () => {
        const simulator2 = new Simulator()
        const connectionManager3 = new ConnectionManager({ ownPeerDescriptor: mockPeerDescriptor3, simulator: simulator2 })
        const connectionManager4 = new ConnectionManager({ ownPeerDescriptor: mockPeerDescriptor4, simulator: simulator2 })

        const msg: Message = {
            serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            } 
        }

        const dataPromise = new Promise<void>((resolve, _reject) => {
            connectionManager4.on('message', async (message: Message) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })

        const connectedPromise1 = new Promise<void>((resolve, _reject) => {
            connectionManager4.on('connected', (_peerDescriptor: PeerDescriptor) => {
                resolve()
            })
        })

        const connectedPromise2 = new Promise<void>((resolve, _reject) => {
            connectionManager3.on('connected', (_peerDescriptor: PeerDescriptor) => {
                resolve()
            })
        })

        const disconnectedPromise1 = new Promise<void>((resolve, _reject) => {
            connectionManager4.on('disconnected', (_peerDescriptor: PeerDescriptor) => {
                resolve()
            })
        })

        const disconnectedPromise2 = new Promise<void>((resolve, _reject) => {
            connectionManager3.on('disconnected', (_peerDescriptor: PeerDescriptor) => {
                resolve()
            })
        })
        msg.targetDescriptor = mockPeerDescriptor4
        connectionManager3.send(msg)
        await Promise.all([dataPromise, connectedPromise1, connectedPromise2])

        // @ts-expect-error private field
        connectionManager3.closeConnection(mockPeerDescriptor4)

        await Promise.all([disconnectedPromise1, disconnectedPromise2])
        await connectionManager3.stop()
        await connectionManager4.stop()
    })

    it('Cannot send to own WebSocketServer if kademliaIds do not match', async () => {
        const connectionManager1 = new ConnectionManager({
            transportLayer: mockTransport,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 10001, max: 10001 }
        })

        await connectionManager1.start((report) => {
            expect(report.host).toEqual('127.0.0.1')
            expect(report.openInternet).toEqual(true)
            return createPeerDescriptor(report)
        })
        const peerDescriptor = connectionManager1.getPeerDescriptor()
        peerDescriptor.kademliaId = new Uint8Array([12, 12, 12, 12])
        const msg: Message = {
            serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            targetDescriptor: peerDescriptor,
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            } 
        }
        await expect(connectionManager1.send(msg))
            .rejects
            .toThrow('Cannot send to self')
        
        await connectionManager1.stop()
    })

    it('Cannot send to a WebSocketServer if kademlia do not match', async () => {
        const peerDescriptor1 = {
            kademliaId: PeerID.fromString('tester1').value,
            type: NodeType.NODEJS,
            websocket: {
                host: '127.0.0.1',
                port: 10002,
                tls: false
            }
        }
        const connectionManager1 = new ConnectionManager({ 
            transportLayer: mockConnectorTransport1,
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 10002, max: 10002 },
            ownPeerDescriptor: peerDescriptor1
        })

        await connectionManager1.start(() => peerDescriptor1)

        const peerDescriptor2 = {
            kademliaId: PeerID.fromString('tester2').value,
            type: NodeType.NODEJS,
            websocket: {
                host: '127.0.0.1',
                port: 10003,
                tls: false
            }
        }
        const connectionManager2 = new ConnectionManager({
            transportLayer: mockConnectorTransport2,
            websocketPortRange: { min: 10003, max: 10003 },
            ownPeerDescriptor: peerDescriptor2,
        })

        await connectionManager2.start(() => peerDescriptor2)

        const msg: Message = {
            serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            targetDescriptor: {
                kademliaId: new Uint8Array([1, 2, 3, 4]),
                type: NodeType.NODEJS,
                websocket: peerDescriptor2.websocket
            },
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            } 
        }
        await connectionManager1.send(msg)      
        
        await expect(waitForEvent3<any>(connectionManager2, 'message'))
            .rejects
            .toThrow()
        await connectionManager1.stop()
        await connectionManager2.stop()
    }, 10000)

})
