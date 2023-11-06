import { FindResult, IFinder } from '../../../src/dht/find/Finder'
import { RouteMessageAck } from '../../../src/proto/packages/dht/protos/DhtRpc'

export class MockFinder implements IFinder {

    // eslint-disable-next-line class-methods-use-this
    async startFind(): Promise<FindResult> {
        return {
            closestNodes: [],
            dataEntries: []
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async routeFindRequest(): Promise<RouteMessageAck> {
        return RouteMessageAck.create()
    }

}
