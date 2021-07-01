import { ServerWsEndpoint } from '../../src/connection/ServerWsEndpoint'
import { ClientWsEndpoint } from '../../src/connection/ClientWsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { Event } from "../../src/connection/AbstractWsEndpoint"
import { startServerWsEndpoint } from '../utils'

describe('WsEndpoint: back pressure handling', () => {
    let epClient: ClientWsEndpoint
    let epServer: ServerWsEndpoint

    beforeEach(async () => {
        epClient = new ClientWsEndpoint(PeerInfo.newNode('epClient'))
        epServer = await startServerWsEndpoint('127.0.0.1', 43975, PeerInfo.newTracker('epServer'))
        await epClient.connect('ws://127.0.0.1:43975')
    })

    afterEach(async () => {
        Promise.allSettled([
            epClient.stop(),
            epServer.stop()
        ])
    })

    it('emits HIGH_BACK_PRESSURE on high back pressure', (done) => {
        let hitHighBackPressure = false
        epClient.on(Event.HIGH_BACK_PRESSURE, (peerInfo) => {
            hitHighBackPressure = true
            expect(peerInfo).toEqual(PeerInfo.newTracker('epServer'))
            done()
        })
        while (!hitHighBackPressure) {
            epClient.send('epServer', 'aaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbccccccccccccccccdddddddddddeeeeeeeeffffff')
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
            epClient.send('epServer', 'aaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbccccccccccccccccdddddddddddeeeeeeeeffffff')
        }
    })
})
