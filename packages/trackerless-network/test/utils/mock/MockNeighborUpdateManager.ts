import { INeighborUpdateManager } from '../../../src/logic/neighbor-discovery/NeighborUpdateManager'
import { NeighborUpdate } from '../../../src/proto/packages/trackerless-network/protos/NetworkRpc'

export class MockNeighborUpdateManager implements INeighborUpdateManager {

    // eslint-disable-next-line class-methods-use-this
    async start(): Promise<void> {

    }

    // eslint-disable-next-line class-methods-use-this
    stop(): void {

    }

    // eslint-disable-next-line class-methods-use-this
    async neighborUpdate(): Promise<NeighborUpdate> {
        return NeighborUpdate.create()
    }
}
