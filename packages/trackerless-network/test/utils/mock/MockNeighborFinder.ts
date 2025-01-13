import { Methods } from '@streamr/test-utils'
import { NeighborFinder } from '../../../src/logic/neighbor-discovery/NeighborFinder'

export class MockNeighborFinder implements Methods<NeighborFinder> {
    // eslint-disable-next-line class-methods-use-this
    start(): void {}

    // eslint-disable-next-line class-methods-use-this
    stop(): void {}

    // eslint-disable-next-line class-methods-use-this
    isRunning(): boolean {
        return false
    }
}
