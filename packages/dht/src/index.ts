import { DhtTransportClient } from './transport/DhtTransportClient'
import { getClosestPeersClient } from './proto/ClosestPeers.client'
import { MockTransport } from './transport/MockTransport'

const main = async () => {

    const transport = new DhtTransportClient(new MockTransport())
    const client = new getClosestPeersClient(transport)

    const response = client.rpc({peerId: 'peer', nonce: '1'})
    await response.response
}

main()