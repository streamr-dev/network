import {
    RpcCommunicator,
    ProtoCallContext,
    ProtoRpcClient,
    toProtoRpcClient
} from '@streamr/proto-rpc'
import { NetworkRpcClient } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'
import {
    StreamMessage,
    ContentMessage
} from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { waitForCondition } from '@streamr/utils'
import { Empty } from '../../src/proto/google/protobuf/empty'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { createStreamMessage } from '../utils'
import { RpcMessage } from '../../src/proto/packages/proto-rpc/protos/ProtoRpc'

describe('Network RPC', () => {
    let rpcCommunicator1: RpcCommunicator
    let rpcCommunicator2: RpcCommunicator
    let client: ProtoRpcClient<NetworkRpcClient>

    let recvCounter = 0

    beforeEach(() => {
        rpcCommunicator1 = new RpcCommunicator()
        rpcCommunicator2 = new RpcCommunicator()
        rpcCommunicator1.on('outgoingMessage', (message: RpcMessage, _requestId: string, _ucallContext?: ProtoCallContext) => {
            rpcCommunicator2.handleIncomingMessage(message)
        })
        client = toProtoRpcClient(new NetworkRpcClient(rpcCommunicator1.getRpcClientTransport()))
        rpcCommunicator2.registerRpcNotification(
            StreamMessage,
            'sendData',
            async (_msg: StreamMessage, _context: ServerCallContext): Promise<Empty> => {
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
        const content: ContentMessage = {
            body: JSON.stringify({ hello: "WORLD" })
        }
        const msg = createStreamMessage(
            content,
            'testStream',
            'peer1'
        )
        await client.sendData(msg)
        await waitForCondition(() => recvCounter === 1)
    })
})
