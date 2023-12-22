import { RpcCommunicator } from '@streamr/proto-rpc'
import { randomEthereumAddress } from '@streamr/test-utils'
import { hexToBinary } from '@streamr/utils'
import { ProxyConnectionRpcRemote } from '../../src/logic/proxy/ProxyConnectionRpcRemote'
import { ProxyConnectionRequest, ProxyDirection } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { ProxyConnectionRpcClient } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc.client'
import { createMockPeerDescriptor } from '../utils/utils'

describe('ProxyConnectionRpcRemote', () => {

    it('happy path', async () => {
        const onOutgoingMessage = jest.fn()
        const rpcCommunicator = new RpcCommunicator()
        rpcCommunicator.setOutgoingMessageListener(onOutgoingMessage)
        const clientPeerDescriptor = createMockPeerDescriptor()
        const serverPeerDescriptor = createMockPeerDescriptor()
        const rpcRemote = new ProxyConnectionRpcRemote(
            clientPeerDescriptor,
            serverPeerDescriptor,
            rpcCommunicator,
            ProxyConnectionRpcClient
        )

        const userId = randomEthereumAddress()
        await rpcRemote.requestConnection(ProxyDirection.PUBLISH, userId)

        const [rpcMessage, _, callContext] = onOutgoingMessage.mock.calls[0]
        const request = ProxyConnectionRequest.fromBinary(rpcMessage.body.value)
        expect(request).toEqual({
            direction: ProxyDirection.PUBLISH,
            userId: Uint8Array.from(hexToBinary(userId))
        })
        expect(callContext).toMatchObject({
            sourceDescriptor: clientPeerDescriptor,
            targetDescriptor: serverPeerDescriptor,
            timeout: 5000
        })
    })
})
