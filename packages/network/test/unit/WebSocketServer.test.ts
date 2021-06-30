import { startServerWsEndpoint, ServerWsEndpoint } from '../../src/connection/ServerWsEndpoint'
import { startClientWsEndpoint, ClientWsEndpoint } from '../../src/connection/ClientWsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { MetricsContext } from '../../src/helpers/MetricsContext'
import { waitForCondition } from 'streamr-test-utils'

async function setUpWsClient(peerId: string, peerType: string, city: string): Promise<ClientWsEndpoint> {
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
    const wsClient = await startClientWsEndpoint(peerInfo, peerId, metricsContext)
    return wsClient
}
async function setUpWsServer(peerId: string, peerType: string, city: string, port: number): Promise<ServerWsEndpoint> {
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
    const wsEndpoint = await startServerWsEndpoint(
        '127.0.0.1',
        port,
        peerInfo,
        null,
        metricsContext,
        100
    )
    return wsEndpoint
}

describe('WsServer&WsClient with no connections', () => {
    let wsEndpoint: ServerWsEndpoint

    beforeAll(async () => {
        wsEndpoint = await setUpWsServer('peerId', 'tracker', 'Espoo', 30465)
    })

    afterAll(async () => {
        await wsEndpoint.stop()
    })

    it('getAddress() gives websocket address', () => {
        expect(wsEndpoint.getAddress()).toEqual('ws://127.0.0.1:30465')
    })

    it('getPeerInfo() gives peer info of endpoint', () => {
        expect(wsEndpoint.getPeerInfo()).toEqual(PeerInfo.newTracker(
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
        ))
    })

    it('isConnected() returns false', () => {
        expect(wsEndpoint.isConnected('thirdPeerId')).toEqual(false)
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

describe('WsServer&WsClient with connections', () => {
    let wsEndpoint: ServerWsEndpoint
    let otherWsEndpoint: ClientWsEndpoint
    let thirdWsEndpoint: ClientWsEndpoint

    beforeAll(async () => {
        wsEndpoint = await setUpWsServer('peerId', 'tracker', 'Espoo', 30466)
        otherWsEndpoint = await setUpWsClient('otherPeerId', 'node', 'Helsinki')
        thirdWsEndpoint = await setUpWsClient('thirdPeerId', 'node', 'Helsinki')
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
        expect(wsEndpoint.isConnected('otherPeerId')).toEqual(true)
        expect(wsEndpoint.isConnected('thirdPeerId')).toEqual(true)
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
            'otherPeerId',
            'thirdPeerId'
        ])
    })

    it('getPeerInfos() is empty', () => {
        expect(wsEndpoint.getPeerInfos()).toEqual([
            PeerInfo.newNode(
                'otherPeerId',
                null,
                undefined,
                undefined,
                {
                    latitude: null,
                    longitude: null,
                    country: null,
                    city: null }
            ),
            PeerInfo.newNode('thirdPeerId',
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
        ])
    })

    it('resolveAddress throws error', () => {
        expect(wsEndpoint.resolveAddress('otherPeerId')).toEqual('127.0.0.1')
    })
})
