import { StreamPartIDUtils } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { hexToBinary } from '@streamr/utils'
import { RemoteProxyServer } from '../../src/logic/proxy/RemoteProxyServer'
import { ProxyDirection } from '../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { createMockPeerDescriptor } from '../utils/utils'
import { getNodeIdFromPeerDescriptor } from '../../src/identifiers'

describe('RemoteProxyServer', () => {

    it('happy path', () => {
        const client = {
            requestConnection: jest.fn()
        }
        const serverPeerDescriptor = createMockPeerDescriptor()
        const server = new RemoteProxyServer(
            serverPeerDescriptor,
            StreamPartIDUtils.parse('stream-id#5'), 
            client
        )
        const clientPeerDescriptor = createMockPeerDescriptor()
        const userId = randomEthereumAddress()
        server.requestConnection(clientPeerDescriptor, ProxyDirection.PUBLISH, userId)
        expect(client.requestConnection).toBeCalledWith({
            senderId: hexToBinary(getNodeIdFromPeerDescriptor(clientPeerDescriptor)),
            senderDescriptor: clientPeerDescriptor,
            streamId: 'stream-id',
            streamPartition: 5,
            direction: ProxyDirection.PUBLISH,
            userId: hexToBinary(userId)
        }, {
            sourceDescriptor: clientPeerDescriptor,
            targetDescriptor: serverPeerDescriptor,
            timeout: 5000
        })
    })
})
