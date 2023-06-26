import { RecursiveFindResult, IRecursiveFinder } from '../../../src/dht/find/RecursiveFinder'
import { RouteMessageAck, RouteMessageWrapper } from '../../../src/proto/packages/dht/protos/DhtRpc'

export class MockRecursiveFinder implements IRecursiveFinder {

    // eslint-disable-next-line class-methods-use-this
    async startRecursiveFind(): Promise<RecursiveFindResult> {
        return {
            closestNodes: [],
            dataEntries: []
        }
    }

    // eslint-disable-next-line class-methods-use-this
    async findRecursively(_routedMessage: RouteMessageWrapper): Promise<RouteMessageAck> {
        return RouteMessageAck.create()
    }

}
