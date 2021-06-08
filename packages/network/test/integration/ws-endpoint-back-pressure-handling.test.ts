import { Event } from '../../src/connection/IWsEndpoint'
import { startEndpoint, WsEndpoint } from '../../src/connection/WsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'

describe('WsEndpoint: back pressure handling', () => {
    let ep1: WsEndpoint
    let ep2: WsEndpoint

    beforeEach(async () => {
        ep1 = await startEndpoint('127.0.0.1', 43974, PeerInfo.newNode('ep1'), null)
        ep2 = await startEndpoint('127.0.0.1', 43975, PeerInfo.newNode('ep2'), null)
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
        const ep2 = PeerInfo.newNode('ep2')
        ep1.on(Event.HIGH_BACK_PRESSURE, (peerInfo) => {
            hitHighBackPressure = true
            expect(peerInfo).toEqual(expect.objectContaining({
                peerId: ep2.peerId,
                peerType: ep2.peerType,
                controlLayerVersions: ep2.controlLayerVersions,
                messageLayerVersions: ep2.messageLayerVersions,
                peerName: ep2.peerName,
                location: ep2.location,        
            }))
            done()
        })
        while (!hitHighBackPressure) {
            ep1.send('ep2', 'aaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbccccccccccccccccdddddddddddeeeeeeeeffffff')
        }
    })

    it('emits LOW_BACK_PRESSURE after high back pressure', (done) => {
        let hitHighBackPressure = false
        let sendInterval: ReturnType<typeof setInterval> | null = null
        ep1.on(Event.HIGH_BACK_PRESSURE, () => {
            hitHighBackPressure = true

            // drain doesn't seem to work, need to send _evaluateBackPressure
            sendInterval = setInterval(() => ep1.send('ep2', 'aaaa'), 30)

            const ep2 = PeerInfo.newNode('ep2')
            ep1.on(Event.LOW_BACK_PRESSURE, (peerInfo) => {
                expect(peerInfo).toEqual(expect.objectContaining({
                    peerId: ep2.peerId,
                    peerType: ep2.peerType,
                    controlLayerVersions: ep2.controlLayerVersions,
                    messageLayerVersions: ep2.messageLayerVersions,
                    peerName: ep2.peerName,
                    location: ep2.location,        
                }))
                clearInterval(sendInterval!)
                done()
            })
        })
        while (!hitHighBackPressure) {
            ep1.send('ep2', 'aaaaaaaaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbccccccccccccccccdddddddddddeeeeeeeeffffff')
        }
    })
})
