import { Methods } from '@streamr/test-utils'
import { NeighborUpdateManager } from '../../../src/logic/neighbor-discovery/NeighborUpdateManager'
import { NeighborUpdate } from '../../../generated/packages/trackerless-network/protos/NetworkRpc'

export class MockNeighborUpdateManager implements Methods<NeighborUpdateManager> {
    // eslint-disable-next-line class-methods-use-this
    async start(): Promise<void> {}

    // eslint-disable-next-line class-methods-use-this
    stop(): void {}

    // eslint-disable-next-line class-methods-use-this
    async neighborUpdate(): Promise<NeighborUpdate> {
        return NeighborUpdate.create()
    }
}
