import { TrackerServer } from '../../src/protocol/TrackerServer'
import { Event, WsEndpoint } from '../../src/connection/WsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'

describe(TrackerServer, () => {
    it('getNodeIds', () => {
        const trackerServer = new TrackerServer({
            on(_event: Event, _args: any): void {
            },
            getPeerInfo(): Readonly<PeerInfo> {
                return PeerInfo.newNode('nodeZero', 'nodeZero', null)
            },
            getPeerInfos(): PeerInfo[] {
                return [
                    PeerInfo.newNode('nodeOne', 'nodeOne', null),
                    PeerInfo.newNode('nodeTwo', 'nodeTwo', null),
                    PeerInfo.newTracker('tracker', 'tracker', null),
                    PeerInfo.newUnknown('unknownPeer'),
                    PeerInfo.newStorage('storageNode', 'storageNode', null)
                ]
            }
        } as WsEndpoint)
        expect(trackerServer.getNodeIds()).toEqual(['nodeOne', 'nodeTwo', 'storageNode'])
    })
})
