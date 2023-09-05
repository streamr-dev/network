import { NodeID } from '../../../src/identifiers'
import { INeighborFinder } from '../../../src/logic/neighbor-discovery/NeighborFinder'

export class MockNeighborFinder implements INeighborFinder {

    // eslint-disable-next-line class-methods-use-this
    start(_excluded?: NodeID[]): void {

    }

    // eslint-disable-next-line class-methods-use-this
    stop(): void {

    }

    // eslint-disable-next-line class-methods-use-this
    isRunning(): boolean {
        return false
    }
}
