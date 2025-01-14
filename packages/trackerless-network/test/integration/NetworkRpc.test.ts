import { DhtCallContext } from '@streamr/dht'
import { ProtoRpcClient, RpcCommunicator, toProtoRpcClient } from '@streamr/proto-rpc'
import { StreamPartIDUtils, until } from '@streamr/utils'
import { Empty } from '../../generated/google/protobuf/empty'
import { RpcMessage } from '../../generated/packages/proto-rpc/protos/ProtoRpc'
import { StreamMessage } from '../../generated/packages/trackerless-network/protos/NetworkRpc'
import { ContentDeliveryRpcClient } from '../../generated/packages/trackerless-network/protos/NetworkRpc.client'
import { createStreamMessage } from '../utils/utils'
import { randomUserId } from '@streamr/test-utils'

describe('Network RPC', () => {
    let rpcCommunicator1: RpcCommunicator<DhtCallContext>
    let rpcCommunicator2: RpcCommunicator<DhtCallContext>
    let client: ProtoRpcClient<ContentDeliveryRpcClient>
    let recvCounter = 0

    beforeEach(() => {
        rpcCommunicator1 = new RpcCommunicator()
        rpcCommunicator2 = new RpcCommunicator()
        rpcCommunicator1.setOutgoingMessageListener(async (message: RpcMessage) => {
            rpcCommunicator2.handleIncomingMessage(message, new DhtCallContext())
        })
        client = toProtoRpcClient(new ContentDeliveryRpcClient(rpcCommunicator1.getRpcClientTransport()))
        rpcCommunicator2.registerRpcNotification(StreamMessage, 'sendStreamMessage', async (): Promise<Empty> => {
            recvCounter += 1
            return {}
        })
    })

    afterEach(() => {
        rpcCommunicator1.stop()
        rpcCommunicator2.stop()
    })

    it('sends Data', async () => {
        const msg = createStreamMessage(
            JSON.stringify({ hello: 'WORLD' }),
            StreamPartIDUtils.parse('testStream#0'),
            randomUserId()
        )
        await client.sendStreamMessage(msg)
        await until(() => recvCounter === 1)
    })
})
