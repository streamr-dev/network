import { TrackerServer } from '../../src/protocol/TrackerServer'
import { Event } from '../../src/connection/IWsEndpoint'
import { WsEndpoint } from '../../src/connection/WsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'

describe(TrackerServer, () => {
    it('getNodeIds', () => {
        const nodeOne = PeerInfo.newNode('nodeOne', 'nodeOne', undefined , undefined,null)
        const nodeTwo = PeerInfo.newNode('nodeTwo', 'nodeTwo',undefined , undefined, null)
        const storageNode = PeerInfo.newStorage('storageNode', 'storageNode', undefined , undefined, null)

        const trackerServer = new TrackerServer({
            on(_event: Event, _args: any): void {
            },
            getPeerInfo(): Readonly<PeerInfo> {
                return PeerInfo.newNode('nodeZero', 'nodeZero', undefined , undefined,null)
            },
            getPeerInfos(): PeerInfo[] {
                return [
                    nodeOne,
                    nodeTwo,
                    PeerInfo.newTracker('tracker', 'tracker', undefined , undefined,null),
                    PeerInfo.newUnknown('unknownPeer'),
                    storageNode
                ]
            }
        } as WsEndpoint)
        expect(trackerServer.getNodeIds()).toEqual([nodeOne.peerId, nodeTwo.peerId, storageNode.peerId])
    })
})
