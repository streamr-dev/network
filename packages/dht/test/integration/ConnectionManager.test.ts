import { ConnectionManager } from "../../src/connection/ConnectionManager"
import { Message, MessageType, NodeType, PeerDescriptor } from "../../src/proto/packages/dht/protos/DhtRpc"
import { PeerID } from '../../src/helpers/PeerID'
import { Simulator } from '../../src/connection/Simulator/Simulator'
import { createPeerDescriptor } from "../../src/dht/DhtNode"
import { RpcMessage } from "../../src/proto/packages/proto-rpc/protos/ProtoRpc"
import { Logger } from "@streamr/utils"

const logger = new Logger(module)

describe('ConnectionManager', () => {
    const serviceId = 'demo'

    const mockPeerDescriptor1: PeerDescriptor = {
        kademliaId: PeerID.fromString("tester1").value,
        nodeName: "tester1",
        type: NodeType.NODEJS
    }
    const mockPeerDescriptor2: PeerDescriptor = {
        kademliaId: PeerID.fromString("tester2").value,
        nodeName: "tester2",
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
        const connectionManager = new ConnectionManager({ transportLayer: mockTransport, webSocketHost: '127.0.0.1', webSocketPort: 9991 })

        await connectionManager.start((report) => {
            expect(report.ip).toEqual('127.0.0.1')
            expect(report.openInternet).toEqual(true)
            return createPeerDescriptor(report)
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
            return createPeerDescriptor(report)
        })).rejects.toThrow('Failed to connect to the entrypoints')

        await connectionManager.stop()
    }, 15000)

    it('Can probe connectivity in open internet', async () => {
        const connectionManager1 = new ConnectionManager({ transportLayer: mockTransport, webSocketHost: '127.0.0.1', webSocketPort: 9993 })

        await connectionManager1.start((report) => {
            expect(report.ip).toEqual('127.0.0.1')
            expect(report.openInternet).toEqual(true)
            return createPeerDescriptor(report)
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
            return createPeerDescriptor(report)
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
            peerDescriptor = createPeerDescriptor(report)
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
            peerDescriptor2 = createPeerDescriptor(report2)
            return peerDescriptor2
        })

        const msg: Message = {
            serviceId: serviceId,
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
            peerDescriptor = createPeerDescriptor(report)
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
            peerDescriptor2 = createPeerDescriptor(report2)
            return peerDescriptor2
        })

        const msg: Message = {
            serviceId: serviceId,
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
})
