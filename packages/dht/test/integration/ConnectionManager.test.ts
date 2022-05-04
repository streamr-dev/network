/* eslint-disable @typescript-eslint/no-unused-vars */

import { ConnectionManager } from "../../src/connection/ConnectionManager"
import { Event as ConnectionManagerEvents } from "../../src/connection/IConnectionManager"
import { PeerID } from "../../src/PeerID"
import { ConnectivityResponseMessage, Message, MessageType, NodeType, PeerDescriptor } from "../../src/proto/DhtRpc"

describe('ConnectionManager', () => {
    beforeAll(async () => {
    })

    const createPeerDescriptor = (msg: ConnectivityResponseMessage): PeerDescriptor => {

        const ret: PeerDescriptor = {
            peerId: PeerID.fromIp(msg.ip).value,
            type: NodeType.NODEJS,
            websocket: {ip: msg.websocket!.ip, port: msg.websocket!.port}
        }
        return ret 
    }

    it('Can start alone', async () => {
        const connectionManager = new ConnectionManager({ webSocketHost: 'localhost', webSocketPort: 9991 })

        const result = await connectionManager.start()

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

        await expect(connectionManager.start())
            .rejects
            .toThrow('Failed to connect to the entrypoints')

        await connectionManager.stop()
    })

    it('Can probe connectivity in open internet', async () => {
        const connectionManager = new ConnectionManager({ webSocketHost: 'localhost', webSocketPort: 9993 })

        const result = await connectionManager.start()
        connectionManager.enableConnectivity(createPeerDescriptor(result))

        expect(result.ip).toEqual('localhost')
        expect(result.openInternet).toEqual(true)

        const connectionManager2 = new ConnectionManager({
            webSocketPort: 9994, entryPoints: [
                { peerId: Uint8Array.from([1, 2, 3]), type: NodeType.NODEJS, websocket: { ip: 'localhost', port: 9993 } }
            ]
        })

        const result2 = await connectionManager2.start()
        connectionManager2.enableConnectivity(createPeerDescriptor(result2))

        expect(result2.ip).toEqual('127.0.0.1')
        expect(result2.openInternet).toEqual(true)

        await connectionManager.stop()
        await connectionManager2.stop()
    })

    it('Can send data to other connectionmanager over websocket', async () => {
        const connectionManager = new ConnectionManager({ webSocketHost: 'localhost', webSocketPort: 9995 })

        const result = await connectionManager.start()
        const peerDescriptor = createPeerDescriptor(result)
        connectionManager.enableConnectivity(peerDescriptor)

        expect(result.ip).toEqual('localhost')
        expect(result.openInternet).toEqual(true)

        const connectionManager2 = new ConnectionManager({
            webSocketPort: 9996, entryPoints: [
                peerDescriptor 
            ]
        })

        const result2 = await connectionManager2.start()
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
            connectionManager2.on(ConnectionManagerEvents.MESSAGE, async (peerDescriptor: PeerDescriptor, message: Message) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })
        connectionManager.send(peerDescriptor2, msg)
        
        await promise
        
        await connectionManager.stop()
        await connectionManager2.stop()
    })
    
    afterAll(async () => {
    })
})