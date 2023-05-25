import { ConnectionManager } from "../../src/connection/ConnectionManager"
import { Message, MessageType, NodeType, PeerDescriptor } from "../../src/proto/packages/dht/protos/DhtRpc"
import { PeerID } from '../../src/helpers/PeerID'
import { Simulator } from '../../src/connection/Simulator/Simulator'
import { RpcMessage } from "../../src/proto/packages/proto-rpc/protos/ProtoRpc"

jest.setTimeout(10000)

describe('ConnectionManagerSimulated', () => {
    const serviceId = 'demo'
    
    const mockPeerDescriptor3: PeerDescriptor = {
        kademliaId: PeerID.fromString("tester3").value,
        nodeName: "tester3",
        type: NodeType.NODEJS
    }
    const mockPeerDescriptor4: PeerDescriptor = {
        kademliaId: PeerID.fromString("tester4").value,
        nodeName: "tester4",
        type: NodeType.NODEJS
    }
    
    Simulator.useFakeTimers()
    
    it('Connects and disconnects over simulated connections', async () => {
        
        const simulator2 = new Simulator()
        const connectionManager3 = new ConnectionManager({ ownPeerDescriptor: mockPeerDescriptor3, simulator: simulator2 })
        const connectionManager4 = new ConnectionManager({ ownPeerDescriptor: mockPeerDescriptor4, simulator: simulator2 })

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
})
