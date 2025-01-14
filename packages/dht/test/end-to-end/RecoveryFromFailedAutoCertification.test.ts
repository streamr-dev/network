import { DhtNode } from '../../src/dht/DhtNode'
import { PeerDescriptor } from '../../generated/packages/dht/protos/DhtRpc'
import os from 'os'

describe('Failed autocertification', () => {
    let entryPoint: DhtNode
    let failedAutocertificationNode: DhtNode
    let node: DhtNode
    let entryPointPeerDescriptor: PeerDescriptor

    beforeEach(async () => {
        entryPoint = new DhtNode({
            websocketHost: '127.0.0.1',
            websocketPortRange: { min: 11112, max: 11112 },
            websocketServerEnableTls: false
        })
        await entryPoint.start()
        entryPointPeerDescriptor = entryPoint.getLocalPeerDescriptor()
        await entryPoint.joinDht([entryPointPeerDescriptor])

        failedAutocertificationNode = new DhtNode({
            websocketPortRange: { min: 11113, max: 11113 },
            websocketHost: '127.0.0.1',
            entryPoints: [entryPointPeerDescriptor],
            websocketServerEnableTls: true,
            autoCertifierConfigFile: os.tmpdir() + '/failedAutoCertificationConfigFile.json',
            autoCertifierUrl: 'http://127.0.0.1:44444'
        })

        node = new DhtNode({
            websocketPortRange: { min: 11114, max: 11114 },
            websocketHost: '127.0.0.1',
            entryPoints: [entryPointPeerDescriptor],
            websocketServerEnableTls: false
        })

        await node.start()
        await node.joinDht([entryPointPeerDescriptor])
    })

    afterEach(async () => {
        await failedAutocertificationNode.stop()
        await entryPoint.stop()
        await node.stop()
    })

    it('failed auto certification should default to no tls', async () => {
        await failedAutocertificationNode.start()
        const failedAutocertificationPeerDescriptor = failedAutocertificationNode.getLocalPeerDescriptor()
        expect(failedAutocertificationPeerDescriptor.websocket!.tls).toBe(false)
        await failedAutocertificationNode.joinDht([entryPointPeerDescriptor])
        expect(failedAutocertificationNode.getNeighborCount()).toEqual(2)
    })
})
