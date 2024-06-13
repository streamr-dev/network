import { DhtCallContext } from '@streamr/dht'
import {
    ProtoRpcClient,
    RpcCommunicator,
    toProtoRpcClient
} from '@streamr/proto-rpc'
import { randomEthereumAddress } from '@streamr/test-utils'
import { StreamPartIDUtils, waitForCondition } from '@streamr/utils'
import { Empty } from '../../src/proto/google/protobuf/empty'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'
import { StreamMessage } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { ContentDeliveryRpcClient } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'
import { createStreamMessage } from '../utils/utils'

describe('Network RPC', () => {
    let rpcCommunicator1: RpcCommunicator<DhtCallContext>
    let rpcCommunicator2: RpcCommunicator<DhtCallContext>
    let client: ProtoRpcClient<ContentDeliveryRpcClient>
    let recvCounter = 0

    beforeEach(() => {
        rpcCommunicator1 = new RpcCommunicator()
        rpcCommunicator2 = new RpcCommunicator()
        rpcCommunicator1.on('outgoingMessage', (message: RpcMessage) => {
            rpcCommunicator2.handleIncomingMessage(message)
        })
        client = toProtoRpcClient(new ContentDeliveryRpcClient(rpcCommunicator1.getRpcClientTransport()))
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
            randomBytes(40)
        )
        await client.sendStreamMessage(msg)
        await waitForCondition(() => recvCounter === 1)
    })
})
