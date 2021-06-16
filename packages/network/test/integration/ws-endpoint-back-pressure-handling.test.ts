import { Event } from '../../src/connection/IWsEndpoint'
import { startEndpoint, WsEndpoint } from '../../src/connection/WsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'

describe('WsEndpoint: back pressure handling', () => {
    let ep1: WsEndpoint
    let ep2: WsEndpoint

    let peerInfo1: PeerInfo 
    let peerInfo2: PeerInfo

    beforeEach(async () => {
        peerInfo1 = PeerInfo.newNode('ep1')
        peerInfo2 = PeerInfo.newNode('ep2')
        ep1 = await startEndpoint('127.0.0.1', 43974, peerInfo1, null)
        ep2 = await startEndpoint('127.0.0.1', 43975, peerInfo2, null)
        await ep1.connect('ws://127.0.0.1:43975')
    })

    afterEach(async () => {
        Promise.allSettled([
            ep1.stop(),
            ep2.stop()
        ])
    })

    it('emits HIGH_BACK_PRESSURE on high back pressure', (done) => {
        let hitHighBackPressure = false
        ep1.on(Event.HIGH_BACK_PRESSURE, (peerInfo) => {
            hitHighBackPressure = true
            expect(peerInfo).toEqual(peerInfo2)
            done()
        })
        while (!hitHighBackPressure) {
            ep1.send(peerInfo2.peerId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbccccccccccccccccdddddddddddeeeeeeeeffffff')
        }
    })

    it('emits LOW_BACK_PRESSURE after high back pressure', (done) => {
        let hitHighBackPressure = false
        let sendInterval: ReturnType<typeof setInterval> | null = null
        ep1.on(Event.HIGH_BACK_PRESSURE, () => {
            hitHighBackPressure = true

            // drain doesn't seem to work, need to send _evaluateBackPressure
            sendInterval = setInterval(() => ep1.send(peerInfo2.peerId, 'aaaa'), 30)

            ep1.on(Event.LOW_BACK_PRESSURE, (peerInfo) => {
                expect(peerInfo).toEqual(peerInfo2)
                clearInterval(sendInterval!)
                done()
            })
        })
        while (!hitHighBackPressure) {
            ep1.send(peerInfo2.peerId, 'aaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbccccccccccccccccdddddddddddeeeeeeeeffffff')
        }
    })
})
