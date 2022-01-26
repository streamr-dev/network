import { EthereumAddress, StreamID, toStreamID } from 'streamr-client-protocol'
import { DependencyContainer } from 'tsyringe'
import { NotFoundError, Stream, StreamPermission } from '../../src'
import { StreamRegistry } from '../../src/StreamRegistry'

export class FakeStreamRegistry implements Pick<StreamRegistry, 'getStream' | 'isStreamPublisher'> {

    private streamId: StreamID
    private publisher: EthereumAddress
    private dependencyContainer: DependencyContainer

    constructor(streamId: StreamID, publisher: EthereumAddress, dependencyContainer: DependencyContainer) {
        this.streamId = streamId
        this.publisher = publisher
        this.dependencyContainer = dependencyContainer
    }

    // path support not implemented
    async getStream(streamId: string): Promise<Stream> {
        if (toStreamID(streamId) === this.streamId) {
            return new Stream({
                id: this.streamId,
                partitions: 1,
            }, this.dependencyContainer)
            // eslint-disable-next-line no-else-return
        } else {
            throw new NotFoundError('Stream not found: id=' + streamId)
        }
    }

    // path support not implemented
    async isStreamPublisher(streamId: string, userAddress: EthereumAddress): Promise<boolean> {
        return ((toStreamID(streamId) === this.streamId)
            && (userAddress.toLowerCase() === this.publisher.toLowerCase()))
    }

    // eslint-disable-next-line class-methods-use-this
    async hasPublicPermission(_streamIdOrPath: string, _permission: StreamPermission): Promise<boolean> {
        return false
    }
}
