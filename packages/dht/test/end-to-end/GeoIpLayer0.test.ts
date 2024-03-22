import { WebsocketServerConnection } from '../../src/connection/websocket/WebsocketServerConnection'
import { DhtNode } from '../../src/dht/DhtNode'

const WEBSOCKET_PORT_RANGE = { min: 10012, max: 10015 }

// '51.120.98.194' is the IP address of norway.no in OSL = 7900
const testIp = '51.120.98.194'
const testRegion = 7900

jest.spyOn(WebsocketServerConnection.prototype, 'remoteIpAddress', 'get')
    .mockReturnValue(testIp)

describe('Layer0', () => {

    let epDhtNode: DhtNode
    let node1: DhtNode

    beforeEach(async () => {

        epDhtNode = new DhtNode({
            websocketHost: '127.0.0.1', websocketPortRange: { min: 10011, max: 10011 }, websocketServerEnableTls: false,
            geoIpDatabasePath: '/tmp/tmpPath'
        })
        await epDhtNode.start()
        await epDhtNode.joinDht([epDhtNode.getLocalPeerDescriptor()])

        node1 = new DhtNode({
            websocketPortRange: WEBSOCKET_PORT_RANGE,
            websocketHost: '127.0.0.1',
            entryPoints: [epDhtNode.getLocalPeerDescriptor()],
            websocketServerEnableTls: false
        })

        await Promise.all([
            node1.start()
        ])

    }, 10000)

    afterEach(async () => {
        await Promise.all([
            epDhtNode.stop(),
            node1.stop()
        ])
    })

    it('Gets the correct region number by IP address', async () => {
        await Promise.all([
            node1.joinDht([epDhtNode.getLocalPeerDescriptor()]),
        ])
        
        expect(node1.getLocalPeerDescriptor().region).toBe(testRegion)

    }, 10000)
})
