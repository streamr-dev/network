import { MockTransport } from '../../src/transport/MockTransport'
import { ClosestPeersClient, Event as ClientEvent } from '../../src/rpc-protocol/ClosestPeers/client'
import { ClosestPeersServer, Event as ServerEvent } from '../../src/rpc-protocol/ClosestPeers/server'
import { waitForEvent } from 'streamr-test-utils'
describe('getClosestPeer RPC', () => {
    let transportServer: MockTransport
    let transportClient: MockTransport
    let closestPeersClient: ClosestPeersClient
    let closestPeersServer: ClosestPeersServer

    beforeAll(() => {
        transportClient = new MockTransport()
        transportServer = new MockTransport()
        closestPeersClient = new ClosestPeersClient(transportClient)
        closestPeersServer = new ClosestPeersServer(transportServer)
        transportClient.setFunction(closestPeersServer.getClosestPeers.bind(closestPeersServer))
        transportServer.setFunction(closestPeersClient.onGetClosestPeersResponse.bind(closestPeersClient))
    })

    it('Happy Path', async () => {
        await Promise.all([
            waitForEvent(closestPeersServer, ServerEvent.REQUEST_RECEIVED),
            waitForEvent(closestPeersClient, ClientEvent.RESPONSE_RECEIVED),
            closestPeersClient.getClosestPeers('peer1', 'peer2')
        ])
    })
})
