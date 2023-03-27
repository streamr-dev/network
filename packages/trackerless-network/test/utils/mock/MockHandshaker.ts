import { IHandshaker } from '../../../src/logic/neighbor-discovery/Handshaker'
import { StreamHandshakeResponse, StreamHandshakeRequest, InterleaveNotice } from '../../../src/proto/packages/trackerless-network/protos/NetworkRpc'
import { ServerCallContext } from '@protobuf-ts/runtime-rpc'
import { Empty } from '../../../src/proto/google/protobuf/empty'
import { RemoteHandshaker } from '../../../src/logic/neighbor-discovery/RemoteHandshaker'

export class MockHandshaker implements IHandshaker {

    // eslint-disable-next-line class-methods-use-this
    getOngoingHandshakes(): Set<string> {
        return new Set()
    }

    // eslint-disable-next-line class-methods-use-this
    async attemptHandshakesOnContacts(excludedIds: string[]): Promise<string[]> {
        return excludedIds
    }

}
