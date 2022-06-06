import {
    RpcCommunicator,
    MockConnectionManager,
    PeerDescriptor,
    Simulator,
    Message
} from '@streamr/dht'
import { NetworkRpcClient } from '../../src/proto/NetworkRpc.client'
import { DataMessage, NotificationResponse } from '../../src/proto/NetworkRpc'
import { DummyServerCallContext } from '@streamr/dht/dist/src/rpc-protocol/ServerTransport'
import { waitForCondition } from 'streamr-test-utils'

describe('Network RPC', () => {
    const peer1: PeerDescriptor = {
        peerId: new Uint8Array([1,1,1]),
        type: 1
    }
    const peer2: PeerDescriptor = {
        peerId: new Uint8Array([2,2,2]),
        type: 1
    }
    let rpcCommunicator1: RpcCommunicator
    let rpcCommunicator2: RpcCommunicator
    let client: NetworkRpcClient

    let recvCounter = 0

    beforeEach(() => {
        const simulator = new Simulator()

        rpcCommunicator1 = new RpcCommunicator({
            connectionLayer: new MockConnectionManager(peer1, simulator)
        })
        rpcCommunicator2 = new RpcCommunicator({
            connectionLayer: new MockConnectionManager(peer2, simulator)
        })
        rpcCommunicator1.setSendFn((pd: PeerDescriptor, msg: Message) => rpcCommunicator2.onIncomingMessage(pd, msg))

        client = new NetworkRpcClient(rpcCommunicator1.getRpcClientTransport())
        rpcCommunicator2.registerRpcNotification(
            DataMessage,
            'sendData',
            async (_msg: DataMessage, _context: DummyServerCallContext): Promise<NotificationResponse> => {
                recvCounter += 1
                const res: NotificationResponse = {
                    sent: true
                }
                return res
            }
        )
    })

    afterEach(() => {
        rpcCommunicator1.stop()
        rpcCommunicator2.stop()
    })

    it('sends Data', async () => {
        const data: DataMessage = {
            content: 'data'
        }
        await client.sendData(data,
            { targetDescriptor: peer2, notification: 'notification' }
        )
        await waitForCondition(() => recvCounter === 1)
    })
})
