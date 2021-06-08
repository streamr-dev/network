import { startEndpoint, WsEndpoint } from '../../src/connection/WsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { MetricsContext } from '../../src/helpers/MetricsContext'
import { waitForCondition } from 'streamr-test-utils'
async function setUpEndpoint(peerId: string, peerType: string, city: string, port: number): Promise<WsEndpoint> {
    const peerInfo = PeerInfo.fromObject({
        peerId,
        peerType,
        peerName: peerId,
        location: {
            latitude: null,
            longitude: null,
            country: 'Finland',
            city
        },
        controlLayerVersions: null,
        messageLayerVersions: null
    })
    const metricsContext = new MetricsContext(peerId)
    const wsEndpoint = await startEndpoint(
        '127.0.0.1',
        port,
        peerInfo,
        null,
        metricsContext,
        100
    )
    return wsEndpoint
}

describe('WsEndpoint with no connections', () => {
    let wsEndpoint: WsEndpoint

    beforeAll(async () => {
        wsEndpoint = await setUpEndpoint('peerId', 'tracker', 'Espoo', 30465)
    })

    afterAll(async () => {
        await wsEndpoint.stop()
    })

    it('getAddress() gives websocket address', () => {
        expect(wsEndpoint.getAddress()).toEqual('ws://127.0.0.1:30465')
    })

    it('getPeerInfo() gives peer info of endpoint', () => {
        const originator = PeerInfo.newTracker(
            'peerId',
            'peerId',
            undefined,
            undefined,
            {
                latitude: null,
                longitude: null,
                country: 'Finland',
                city: 'Espoo'
            }
        )
        expect(wsEndpoint.getPeerInfo()).toEqual(expect.objectContaining({
            peerId: originator.peerId,
            peerType: originator.peerType,
            controlLayerVersions: originator.controlLayerVersions,
            messageLayerVersions: originator.messageLayerVersions,
            peerName: originator.peerName,
            location: originator.location,   
        }))
    })

    it('isConnected() returns false', () => {
        expect(wsEndpoint.isConnected('ws://127.0.0.1:30468')).toEqual(false)
    })

    it('getRtts() is empty', () => {
        expect(wsEndpoint.getRtts()).toEqual({})
    })

    it('getPeers() is empty', () => {
        expect(wsEndpoint.getPeers()).toEqual(new Map())
    })

    it('getPeerInfos() is empty', () => {
        expect(wsEndpoint.getPeerInfos()).toEqual([])
    })

    it('resolveAddress throws error', () => {
        expect(() => {
            wsEndpoint.resolveAddress('otherPeerId')
        }).toThrowError('Id otherPeerId not found in peer book')
    })
})

describe('WsEndpoint with connections', () => {
    let wsEndpoint: WsEndpoint
    let otherWsEndpoint: WsEndpoint
    let thirdWsEndpoint: WsEndpoint

    beforeAll(async () => {
        wsEndpoint = await setUpEndpoint('peerId', 'tracker', 'Espoo', 30466)
        otherWsEndpoint = await setUpEndpoint('otherPeerId', 'node', 'Helsinki', 30467)
        thirdWsEndpoint = await setUpEndpoint('thirdPeerId', 'node', 'Helsinki', 30468)
        await otherWsEndpoint.connect(wsEndpoint.getAddress())
        await thirdWsEndpoint.connect(wsEndpoint.getAddress())
    })

    afterAll(async () => {
        await Promise.allSettled([
            wsEndpoint.stop(),
            otherWsEndpoint.stop(),
            thirdWsEndpoint.stop()
        ])
    })

    it('isConnected() is empty', () => {
        expect(wsEndpoint.isConnected('ws://127.0.0.1:30467')).toEqual(true)
        expect(wsEndpoint.isConnected('ws://127.0.0.1:30468')).toEqual(true)
    })

    it('getRtts() is empty', async () => {
        await waitForCondition(() => Object.entries(wsEndpoint.getRtts()).length !== 0)
        const rtts = wsEndpoint.getRtts()
        expect(Object.keys(rtts)).toEqual(['otherPeerId', 'thirdPeerId'])
        expect(rtts.otherPeerId).toBeGreaterThanOrEqual(0)
        expect(rtts.thirdPeerId).toBeGreaterThanOrEqual(0)
    })

    it('getPeers() is empty', () => {
        const peers = wsEndpoint.getPeers()
        expect([...peers.keys()]).toEqual([
            'ws://127.0.0.1:30467',
            'ws://127.0.0.1:30468'
        ])
    })

    it('getPeerInfos() is empty', () => {
        const otherPeer = PeerInfo.newNode(
            'otherPeerId',
            null,
            undefined,
            undefined,
            {
                latitude: null,
                longitude: null,
                country: null,
                city: null 
            }
        )
        const thirdPeer = PeerInfo.newNode(
            'thirdPeerId',
            null,
            undefined,
            undefined,
            {
                latitude: null,
                longitude: null,
                country: null,
                city: null
            }
        )

        expect(wsEndpoint.getPeerInfos()).toEqual([
            expect.objectContaining({
                peerId: otherPeer.peerId,
                peerType: otherPeer.peerType,
                controlLayerVersions: otherPeer.controlLayerVersions,
                messageLayerVersions: otherPeer.messageLayerVersions,
                peerName: otherPeer.peerName,
                location: otherPeer.location,   
            }),
            expect.objectContaining({
                peerId: thirdPeer.peerId,
                peerType: thirdPeer.peerType,
                controlLayerVersions: thirdPeer.controlLayerVersions,
                messageLayerVersions: thirdPeer.messageLayerVersions,
                peerName: thirdPeer.peerName,
                location: thirdPeer.location,   
            })
        ])
    })

    it('resolveAddress throws error', () => {
        expect(wsEndpoint.resolveAddress('otherPeerId')).toEqual('ws://127.0.0.1:30467')
    })
})
