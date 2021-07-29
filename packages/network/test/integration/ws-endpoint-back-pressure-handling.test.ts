import { ServerWsEndpoint } from '../../src/connection/ws/ServerWsEndpoint'
import NodeClientWsEndpoint from '../../src/connection/ws/NodeClientWsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { Event } from "../../src/connection/ws/AbstractWsEndpoint"
import { startServerWsEndpoint } from '../utils'

describe('WsEndpoint: back pressure handling', () => {
    let epClient: NodeClientWsEndpoint
    let epServer: ServerWsEndpoint
    const serverPeerInfo = PeerInfo.newTracker('epServer')
    beforeEach(async () => {
        epClient = new NodeClientWsEndpoint(PeerInfo.newNode('epClient'))
        epServer = await startServerWsEndpoint('127.0.0.1', 43975, serverPeerInfo)
        await epClient.connect('ws://127.0.0.1:43975', serverPeerInfo)
    })

    afterEach(async () => {
        await Promise.allSettled([
            epClient.stop(),
            epServer.stop()
        ])
    })

    it('emits HIGH_BACK_PRESSURE on high back pressure', (done) => {
        let hitHighBackPressure = false
        epClient.on(Event.HIGH_BACK_PRESSURE, (peerInfo: PeerInfo) => {
            hitHighBackPressure = true
            expect(peerInfo).toEqual(PeerInfo.newTracker('epServer'))
            done()
        })
        while (!hitHighBackPressure) {
            epClient.send('epServer', 'aaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbccccccccccccccccdddddddddddeeeeeeeeffffff').catch(() => {})
        }
    })

    it('emits LOW_BACK_PRESSURE after high back pressure', (done) => {
        let hitHighBackPressure = false
        let sendInterval: ReturnType<typeof setInterval> | null = null
        epClient.on(Event.HIGH_BACK_PRESSURE, () => {
            hitHighBackPressure = true

            // drain doesn't seem to work, need to send _evaluateBackPressure
            sendInterval = setInterval(() => epClient.send('epServer', 'aaaa'), 30)

            epClient.on(Event.LOW_BACK_PRESSURE, (peerInfo) => {
                expect(peerInfo).toEqual(PeerInfo.newTracker('epServer'))
                clearInterval(sendInterval!)
                done()
            })
        })
        while (!hitHighBackPressure) {
            epClient.send('epServer', 'aaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbccccccccccccccccdddddddddddeeeeeeeeffffff').catch(() => {})
        }
    })
})
