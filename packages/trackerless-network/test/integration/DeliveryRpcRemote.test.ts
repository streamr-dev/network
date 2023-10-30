import {
    ListeningRpcCommunicator,
    Simulator,
    PeerDescriptor,
    SimulatorTransport,
    NodeType
} from '@streamr/dht'
import { DeliveryRpcRemote } from '../../src/logic/DeliveryRpcRemote'
import { DeliveryRpcClient } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'
import {
    LeaveStreamPartNotice,
    StreamMessage
} from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { Empty } from '../../src/proto/google/protobuf/empty'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { waitForCondition } from '@streamr/utils'
import { toProtoRpcClient } from '@streamr/proto-rpc'
import { createStreamMessage } from '../utils/utils'
import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'

const STREAM_PART_ID = StreamPartIDUtils.parse('test-stream#0')

describe('DeliveryRpcRemote', () => {
    let mockServerRpc: ListeningRpcCommunicator
    let clientRpc: ListeningRpcCommunicator
    let rpcRemote: DeliveryRpcRemote

    const clientNode: PeerDescriptor = {
        kademliaId: new Uint8Array([1, 1, 1]),
        type: NodeType.NODEJS
    }
    const serverNode: PeerDescriptor = {
        kademliaId: new Uint8Array([2, 2, 2]),
        type: NodeType.NODEJS
    }

    let recvCounter: number

    let simulator: Simulator
    let mockConnectionManager1: SimulatorTransport
    let mockConnectionManager2: SimulatorTransport

    beforeEach(() => {
        recvCounter = 0
        simulator = new Simulator()
        mockConnectionManager1 = new SimulatorTransport(serverNode, simulator)
        mockConnectionManager2 = new SimulatorTransport(clientNode, simulator)
        
        mockServerRpc = new ListeningRpcCommunicator('test', mockConnectionManager1)
        clientRpc = new ListeningRpcCommunicator('test', mockConnectionManager2)

        mockServerRpc.registerRpcNotification(
            StreamMessage,
            'sendStreamMessage',
            async (_msg: StreamMessage, _context: ServerCallContext): Promise<Empty> => {
                recvCounter += 1
                return Empty
            }
        )

        mockServerRpc.registerRpcNotification(
            LeaveStreamPartNotice,
            'leaveStreamPartNotice',
            async (_msg: LeaveStreamPartNotice, _context: ServerCallContext): Promise<Empty> => {
                recvCounter += 1
                return Empty
            }
        )

        rpcRemote = new DeliveryRpcRemote(
            clientNode,
            serverNode,
            STREAM_PART_ID,
            toProtoRpcClient(new DeliveryRpcClient(clientRpc.getRpcClientTransport()))
        )
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
            STREAM_PART_ID,
            randomEthereumAddress()
        )

        await rpcRemote.sendStreamMessage(msg)
        await waitForCondition(() => recvCounter === 1)
    })

    it('leaveNotice', async () => {
        rpcRemote.leaveStreamPartNotice()
        await waitForCondition(() => recvCounter === 1)
    })

})
