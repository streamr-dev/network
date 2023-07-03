import { INeighborUpdateManager } from '../../../src/logic/neighbor-discovery/NeighborUpdateManager'
import { NeighborUpdate } from '../../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'

export class MockNeighborUpdateManager implements INeighborUpdateManager {

    // eslint-disable-next-line class-methods-use-this
    async start(): Promise<void> {

    }

    // eslint-disable-next-line class-methods-use-this
    stop(): void {

    }

    // eslint-disable-next-line class-methods-use-this
    async neighborUpdate(_request: NeighborUpdate, _context: ServerCallContext): Promise<NeighborUpdate> {
        return NeighborUpdate.create()
    }
}
