import { DhtTransportClient } from './transport/DhtTransportClient'
import { DhtRpcClient } from './proto/DhtRpc.client'
import { MockTransport } from './transport/MockTransport'

const main = async () => {

    const transport = new DhtTransportClient(new MockTransport())
    const client = new DhtRpcClient(transport)

    const response = client.getClosestPeers({peerId: 'peer', nonce: '1'})
    await response.response
}

main()