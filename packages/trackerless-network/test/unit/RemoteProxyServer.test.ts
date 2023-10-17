import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { hexToBinary } from '@streamr/utils'
import { RemoteProxyServer } from '../../src/logic/proxy/RemoteProxyServer'
import { ProxyDirection } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createMockPeerDescriptor } from '../utils/utils'

describe('RemoteProxyServer', () => {

    it('happy path', () => {
        const client = {
            requestConnection: jest.fn()
        }
        const clientPeerDescriptor = createMockPeerDescriptor()
        const serverPeerDescriptor = createMockPeerDescriptor()
        const server = new RemoteProxyServer(
            clientPeerDescriptor,
            serverPeerDescriptor,
            StreamPartIDUtils.parse('stream#0'),
            client
        )
        const userId = randomEthereumAddress()
        server.requestConnection(ProxyDirection.PUBLISH, userId)
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
