import { Simulator } from '../../src/connection/Simulator/Simulator'
import { SimulatorTransport } from '../../src/connection/Simulator/SimulatorTransport'
import { PeerID } from '../../src/helpers/PeerID'
import { Message, MessageType } from '../../src/proto/packages/dht/protos/DhtRpc'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { waitForCondition } from '@streamr/utils'

describe('SimultaneousConnections', () => {

    let simulator: Simulator
    let connectionManager1: SimulatorTransport
    let connectionManager2: SimulatorTransport

    const peerDescriptor1 = {
        kademliaId: PeerID.fromString('mock1').value,
        type: 0
    }

    const peerDescriptor2 = {
        kademliaId: PeerID.fromString('mock2').value,
        type: 0
    }

    beforeEach(async () => {
        simulator = new Simulator()
        connectionManager1 = new SimulatorTransport(peerDescriptor1, simulator)
        connectionManager2 = new SimulatorTransport(peerDescriptor2, simulator)
    })

    afterEach(async () => {
        await connectionManager1.stop()
        await connectionManager2.stop()
    })

    it('simultanous connection', async () => {
        const baseMsg: Message = {
            serviceId: 'serviceId',
            messageType: MessageType.RPC,
            messageId: '1',
            body: {
                oneofKind: 'rpcMessage',
                rpcMessage: RpcMessage.create()
            }
        }
        const msg1: Message = {
            ...baseMsg,
            targetDescriptor: peerDescriptor2
        }
        const msg2: Message = {
            ...baseMsg,
            targetDescriptor: peerDescriptor1
        }

        const promise1 = new Promise<void>((resolve, _reject) => {
            connectionManager1.on('message', async (message: Message) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })
        const promise2 = new Promise<void>((resolve, _reject) => {
            connectionManager2.on('message', async (message: Message) => {
                expect(message.messageType).toBe(MessageType.RPC)
                resolve()
            })
        })
        await Promise.all([
            promise1,
            promise2,
            connectionManager1.send(msg1),
            connectionManager2.send(msg2)
        ])

        // console.log(connectionManager2.getAllConnectionPeerDescriptors())
        // console.log(connectionManager1.getAllConnectionPeerDescriptors())

        await waitForCondition(() => !!connectionManager2.getConnection(peerDescriptor1))
        await waitForCondition(() => !!connectionManager1.getConnection(peerDescriptor2))
    })

})
