import { ListeningRpcCommunicator, NodeType, PeerDescriptor, Simulator, SimulatorTransport } from '@streamr/dht'
import { StreamPartIDUtils, until } from '@streamr/utils'
import { ContentDeliveryRpcRemote } from '../../src/logic/ContentDeliveryRpcRemote'
import { Empty } from '../../generated/google/protobuf/empty'
import { LeaveStreamPartNotice, StreamMessage } from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { ContentDeliveryRpcClient } from '../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { createStreamMessage } from '../utils/utils'
import { randomUserId } from '@streamr/test-utils'

describe('ContentDeliveryRpcRemote', () => {
    let mockServerRpc: ListeningRpcCommunicator
    let clientRpc: ListeningRpcCommunicator
    let rpcRemote: ContentDeliveryRpcRemote

    const clientNode: PeerDescriptor = {
        nodeId: new Uint8Array([1, 1, 1]),
        type: NodeType.NODEJS
    }
    const serverNode: PeerDescriptor = {
        nodeId: new Uint8Array([2, 2, 2]),
        type: NodeType.NODEJS
    }

    let recvCounter: number

    let simulator: Simulator
    let mockConnectionManager1: SimulatorTransport
    let mockConnectionManager2: SimulatorTransport

    beforeEach(async () => {
        recvCounter = 0
        simulator = new Simulator()
        mockConnectionManager1 = new SimulatorTransport(serverNode, simulator)
        await mockConnectionManager1.start()
        mockConnectionManager2 = new SimulatorTransport(clientNode, simulator)
        await mockConnectionManager2.start()

        mockServerRpc = new ListeningRpcCommunicator('test', mockConnectionManager1)
        clientRpc = new ListeningRpcCommunicator('test', mockConnectionManager2)

        mockServerRpc.registerRpcNotification(StreamMessage, 'sendStreamMessage', async (): Promise<Empty> => {
            recvCounter += 1
            return Empty
        })

        mockServerRpc.registerRpcNotification(
            LeaveStreamPartNotice,
            'leaveStreamPartNotice',
            async (): Promise<Empty> => {
                recvCounter += 1
                return Empty
            }
        )

        rpcRemote = new ContentDeliveryRpcRemote(clientNode, serverNode, clientRpc, ContentDeliveryRpcClient)
    })

    afterEach(async () => {
        clientRpc.stop()
        mockServerRpc.stop()
        await mockConnectionManager1.stop()
        await mockConnectionManager2.stop()
        simulator.stop()
    })

    it('sendStreamMessage', async () => {
        const msg = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }),
            StreamPartIDUtils.parse('test-stream#0'),
            randomUserId()
        )

        await rpcRemote.sendStreamMessage(msg)
        await until(() => recvCounter === 1)
    })

    it('leaveNotice', async () => {
        rpcRemote.leaveStreamPartNotice(StreamPartIDUtils.parse('test#0'), false)
        await until(() => recvCounter === 1)
    })
})
