import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { hexToBinary } from '@streamr/utils'
import { ProxyConnectionRpcRemote } from '../../src/logic/proxy/ProxyConnectionRpcRemote'
import { ProxyDirection } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createMockPeerDescriptor } from '../utils/utils'

describe('ProxyConnectionRpcRemote', () => {

    it('happy path', () => {
        const client = {
            requestConnection: jest.fn()
        }
        const clientPeerDescriptor = createMockPeerDescriptor()
        const serverPeerDescriptor = createMockPeerDescriptor()
        const rpcRemote = new ProxyConnectionRpcRemote(
            clientPeerDescriptor,
            serverPeerDescriptor,
            StreamPartIDUtils.parse('stream#0'),
            client
        )
        const userId = randomEthereumAddress()
        rpcRemote.requestConnection(ProxyDirection.PUBLISH, userId)
        expect(client.requestConnection).toBeCalledWith({
            direction: ProxyDirection.PUBLISH,
            userId: hexToBinary(userId)
        }, {
            sourceDescriptor: clientPeerDescriptor,
            targetDescriptor: serverPeerDescriptor,
            timeout: 5000
        })
    })
})
