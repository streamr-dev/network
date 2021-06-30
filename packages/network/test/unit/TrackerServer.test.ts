import { TrackerServer } from '../../src/protocol/TrackerServer'
import { ServerWsEndpoint } from '../../src/connection/ServerWsEndpoint'
import { PeerInfo } from '../../src/connection/PeerInfo'
import { Event } from "../../src/connection/AbstractWsEndpoint"

describe(TrackerServer, () => {
    it('getNodeIds', () => {
        const trackerServer = new TrackerServer({
            on(_event: Event, _args: any): void {
            },
            getPeerInfo(): Readonly<PeerInfo> {
                return PeerInfo.newNode('nodeZero', 'nodeZero', undefined , undefined,null)
            },
            getPeerInfos(): PeerInfo[] {
                return [
                    PeerInfo.newNode('nodeOne', 'nodeOne', undefined , undefined,null),
                    PeerInfo.newNode('nodeTwo', 'nodeTwo',undefined , undefined, null),
                    PeerInfo.newTracker('tracker', 'tracker', undefined , undefined,null),
                    PeerInfo.newUnknown('unknownPeer'),
                    PeerInfo.newStorage('storageNode', 'storageNode', undefined , undefined, null)
                ]
            }
        } as ServerWsEndpoint)
        expect(trackerServer.getNodeIds()).toEqual(['nodeOne', 'nodeTwo', 'storageNode'])
    })
})
