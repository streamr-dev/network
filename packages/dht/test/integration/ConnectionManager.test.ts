/* eslint-disable @typescript-eslint/no-unused-vars */

import { ConnectionManager } from "../../src/connection/ConnectionManager"
import { Event as ITransportEvent } from "../../src/transport/ITransport"
import { Message, MessageType, NodeType, PeerDescriptor } from "../../src/proto/DhtRpc"
import { createPeerDescriptor } from '../utils'
import { waitForEvent } from 'streamr-test-utils'
import { Event as ConnectionEvent } from '../../src/connection/IConnection'
import { ClientWebSocket } from '../../src/connection/WebSocket/ClientWebSocket'
import { MockConnectionManager } from '../../src/connection/MockConnectionManager'
import { PeerID } from '../../src/PeerID'

describe('ConnectionManager', () => {
    const mockPeerDescriptor1: PeerDescriptor = {
        peerId: PeerID.fromString("tester1").value,
        type: NodeType.NODEJS
    }
    const mockPeerDescriptor2: PeerDescriptor = {
        peerId: PeerID.fromString("tester2").value,
        type: NodeType.NODEJS
    }
    const mockConnectorTransport1 = new MockConnectionManager(mockPeerDescriptor1)
    const mockConnectorTransport2 = new MockConnectionManager(mockPeerDescriptor2)

    beforeAll(async () => {

    })
    it('Can start alone', async () => {
        const connectionManager = new ConnectionManager({ webSocketHost: 'localhost', webSocketPort: 9991 })

        const result = await connectionManager.start(mockConnectorTransport1)

        expect(result.ip).toEqual('localhost')
        expect(result.openInternet).toEqual(true)

        await connectionManager.stop()
    })

    it('Throws an async exception if fails to connect to entrypoints', async () => {

        const connectionManager = new ConnectionManager({
            webSocketPort: 9992, entryPoints: [
                { peerId: Uint8Array.from([1, 2, 3]), type: NodeType.NODEJS, websocket: { ip: 'localhost', port: 123 } }
            ]
        })

        await expect(connectionManager.start(mockConnectorTransport1))
            .rejects
            .toThrow('Failed to connect to the entrypoints')

        await connectionManager.stop()
    })

    it('Can probe connectivity in open internet', async () => {
        const connectionManager = new ConnectionManager({ webSocketHost: 'localhost', webSocketPort: 9993 })

        const result = await connectionManager.start(mockConnectorTransport1)
        connectionManager.enableConnectivity(createPeerDescriptor(result))

        expect(result.ip).toEqual('localhost')
        expect(result.openInternet).toEqual(true)

        const connectionManager2 = new ConnectionManager({
            webSocketPort: 9994, entryPoints: [
                { peerId: Uint8Array.from([1, 2, 3]), type: NodeType.NODEJS, websocket: { ip: 'localhost', port: 9993 } }
            ]
        })

        const result2 = await connectionManager2.start(mockConnectorTransport1)
        connectionManager2.enableConnectivity(createPeerDescriptor(result2))

        expect(result2.ip).toEqual('127.0.0.1')
        expect(result2.openInternet).toEqual(true)

        await connectionManager.stop()
        await connectionManager2.stop()
    })

    it('Can send data to other connectionmanager over websocket', async () => {
        const connectionManager = new ConnectionManager({ webSocketHost: 'localhost', webSocketPort: 9995 })

        const result = await connectionManager.start(mockConnectorTransport1)
        const peerDescriptor = createPeerDescriptor(result)
        connectionManager.enableConnectivity(peerDescriptor)

        expect(result.ip).toEqual('localhost')
        expect(result.openInternet).toEqual(true)

        const connectionManager2 = new ConnectionManager({
            webSocketPort: 9996, entryPoints: [
                peerDescriptor 
            ]
        })

        const result2 = await connectionManager2.start(mockConnectorTransport2)
        const peerDescriptor2 = createPeerDescriptor(result2)
        connectionManager2.enableConnectivity(peerDescriptor2)

        expect(result2.ip).toEqual('127.0.0.1')
        expect(result2.openInternet).toEqual(true)

        const arr = new Uint8Array(10)
        const msg: Message = {
            messageType: MessageType.RPC, 
            messageId: '1',
            body: arr
        }

        const promise = new Promise<void>((resolve, reject) => {
            connectionManager2.on(ITransportEvent.DATA, async (peerDescriptor: PeerDescriptor, message: Message) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })
        connectionManager.send(peerDescriptor2, msg)
        
        await promise
        
        await connectionManager.stop()
        await connectionManager2.stop()
    })

    it('Can disconnect', async () => {
        const connectionManager = new ConnectionManager({ webSocketHost: 'localhost', webSocketPort: 9997 })

        const result = await connectionManager.start(mockConnectorTransport1)
        const peerDescriptor = createPeerDescriptor(result)
        connectionManager.enableConnectivity(peerDescriptor)

        expect(result.ip).toEqual('localhost')
        expect(result.openInternet).toEqual(true)

        const connectionManager2 = new ConnectionManager({
            webSocketPort: 9999, entryPoints: [
                peerDescriptor
            ]
        })

        const result2 = await connectionManager2.start(mockConnectorTransport2)
        const peerDescriptor2 = createPeerDescriptor(result2)
        connectionManager2.enableConnectivity(peerDescriptor2)

        expect(result2.ip).toEqual('127.0.0.1')
        expect(result2.openInternet).toEqual(true)

        const arr = new Uint8Array(10)
        const msg: Message = {
            messageType: MessageType.RPC,
            messageId: '1',
            body: arr
        }

        const promise = new Promise<void>((resolve, reject) => {
            connectionManager2.on(ITransportEvent.DATA, async (peerDescriptor: PeerDescriptor, message: Message) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })
        connectionManager.send(peerDescriptor2, msg)

        await promise
        await Promise.all([
            waitForEvent(connectionManager2.getConnection(peerDescriptor) as ClientWebSocket, ConnectionEvent.DISCONNECTED),
            connectionManager.disconnect(peerDescriptor2, undefined, 100)
        ])
        await connectionManager.stop()
        await connectionManager2.stop()
    })

    afterAll(async () => {
    })
})