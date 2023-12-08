import {
    RpcCommunicator,
    ProtoRpcClient,
    toProtoRpcClient
} from '@streamr/proto-rpc'
import { DeliveryRpcClient } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'
import { StreamMessage } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { waitForCondition } from '@streamr/utils'
import { Empty } from '../../src/proto/google/protobuf/empty'
import { createStreamMessage } from '../utils/utils'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { Simulator } from '@streamr/dht'
import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'

describe('Network RPC', () => {
    let rpcCommunicator1: RpcCommunicator
    let rpcCommunicator2: RpcCommunicator
    let client: ProtoRpcClient<DeliveryRpcClient>
    let recvCounter = 0

    beforeEach(() => {
        rpcCommunicator1 = new RpcCommunicator()
        rpcCommunicator2 = new RpcCommunicator()
        rpcCommunicator1.on('outgoingMessage', (message: RpcMessage) => {
            rpcCommunicator2.handleIncomingMessage(message)
        })
        client = toProtoRpcClient(new DeliveryRpcClient(rpcCommunicator1.getRpcClientTransport()))
        rpcCommunicator2.registerRpcNotification(
            StreamMessage,
            'sendStreamMessage',
            async (): Promise<Empty> => {
                recvCounter += 1
                return {}
            }
        )
    })

    afterEach(() => {
        rpcCommunicator1.stop()
        rpcCommunicator2.stop()
    })

    it('sends Data', async () => {
        const msg = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }),
            StreamPartIDUtils.parse('testStream#0'),
            randomEthereumAddress()
        )
        await client.sendStreamMessage(msg)
        await waitForCondition(() => recvCounter === 1)
    })
})
