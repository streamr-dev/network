import { ConnectionManager } from "../../src/connection/ConnectionManager"
import { Message, MessageType, NodeType, PeerDescriptor } from "../../src/proto/DhtRpc"
import { waitForEvent3 } from '../../src/helpers/waitForEvent3'
import { ClientWebSocket } from '../../src/connection/WebSocket/ClientWebSocket'
import { SimulatorTransport } from '../../src/connection/SimulatorTransport'
import { PeerID } from '../../src/helpers/PeerID'
import { Simulator } from '../../src/connection/Simulator'
import { DhtNode } from "../../src/dht/DhtNode"

describe('ConnectionManager', () => {
    const serviceId = 'demo'

    const mockPeerDescriptor1: PeerDescriptor = {
        peerId: PeerID.fromString("tester1").value,
        type: NodeType.NODEJS
    }
    const mockPeerDescriptor2: PeerDescriptor = {
        peerId: PeerID.fromString("tester2").value,
        type: NodeType.NODEJS
    }
    const simulator = new Simulator()

    const mockTransport = new SimulatorTransport(mockPeerDescriptor1, simulator)
    const mockConnectorTransport1 = new SimulatorTransport(mockPeerDescriptor1, simulator)
    const mockConnectorTransport2 = new SimulatorTransport(mockPeerDescriptor2, simulator)

    it('Can start alone', async () => {
        const connectionManager = new ConnectionManager({ transportLayer: mockTransport, webSocketHost: 'localhost', webSocketPort: 9991 })

        await connectionManager.start((report) => {
            expect(report.ip).toEqual('localhost')
            expect(report.openInternet).toEqual(true)
            return DhtNode.createPeerDescriptor(report)
        })

        await connectionManager.stop()
    })

    // The await expect(doSomething()).rejects.toThrow('someError') method does not work
    // in browsers, use the old non-async way

    it('Throws an async exception if fails to connect to entrypoints', async () => {

        const connectionManager = new ConnectionManager({
            transportLayer: mockTransport,
            webSocketPort: 9992, entryPoints: [
                { peerId: Uint8Array.from([1, 2, 3]), type: NodeType.NODEJS, websocket: { ip: 'localhost', port: 12345 } }
            ]
        })

        await expect(connectionManager.start((report) => {
            return DhtNode.createPeerDescriptor(report)
        })).rejects.toThrow('Failed to connect to the entrypoints')

        await connectionManager.stop()
    })

    it('Can probe connectivity in open internet', async () => {
        const connectionManager1 = new ConnectionManager({ transportLayer: mockTransport, webSocketHost: 'localhost', webSocketPort: 9993 })

        await connectionManager1.start((report) => {
            expect(report.ip).toEqual('localhost')
            expect(report.openInternet).toEqual(true)
            return DhtNode.createPeerDescriptor(report)
        })

        const connectionManager2 = new ConnectionManager({
            transportLayer: mockConnectorTransport2,
            webSocketPort: 9994, entryPoints: [
                { peerId: Uint8Array.from([1, 2, 3]), type: NodeType.NODEJS, websocket: { ip: 'localhost', port: 9993 } }
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
        const connectionManager1 = new ConnectionManager({ transportLayer: mockConnectorTransport1, webSocketHost: 'localhost', webSocketPort: 9995 })

        let peerDescriptor: PeerDescriptor | undefined

        await connectionManager1.start((report) => {
            expect(report.ip).toEqual('localhost')
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

        const arr = new Uint8Array(10)
        const msg: Message = {
            serviceId: serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            body: arr
        }

        const promise = new Promise<void>((resolve, _reject) => {
            connectionManager2.on('DATA', async (message: Message, _peerDescriptor: PeerDescriptor) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })
        connectionManager1.send(msg, peerDescriptor2!)

        await promise

        await connectionManager1.stop()
        await connectionManager2.stop()
    })

    it('Can disconnect', async () => {
        const connectionManager1 = new ConnectionManager({ transportLayer: mockConnectorTransport1, webSocketHost: 'localhost', webSocketPort: 9997 })

        let peerDescriptor: PeerDescriptor | undefined
        await connectionManager1.start((report) => {
            expect(report.ip).toEqual('localhost')
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

        const arr = new Uint8Array(10)
        const msg: Message = {
            serviceId: serviceId,
            messageType: MessageType.RPC,
            messageId: '1',
            body: arr
        }

        const promise = new Promise<void>((resolve, _reject) => {
            connectionManager2.on('DATA', async (message: Message, _peerDescriptor: PeerDescriptor) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })
        connectionManager1.send(msg, peerDescriptor2!)

        await promise
        await Promise.all([
            // @ts-expect-error private
            waitForEvent3(connectionManager2.getConnection(peerDescriptor!).implementation as ClientWebSocket, 'DISCONNECTED'),
            connectionManager1.disconnect(peerDescriptor2!, undefined, 100)
        ])
        await connectionManager1.stop()
        await connectionManager2.stop()
    })

    afterAll(async () => {
    })

})
