import { Readable } from 'stream'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { StreamID, StreamMessage, StreamPartID, toStreamPartID } from 'streamr-client-protocol'
import { URLSearchParams } from 'url'

import { FakeStorageNodeRegistry } from './FakeStorageNodeRegistry'
import { StorageNodeRegistry } from '../../../src/StorageNodeRegistry'

type ResendRequest = { resendType: string, streamPartId: StreamPartID, query?: URLSearchParams }

@scoped(Lifecycle.ContainerScoped)
export class FakeHttpUtil {
    private readonly storageNodeRegistry: FakeStorageNodeRegistry

    constructor(
        @inject(StorageNodeRegistry) storageNodeRegistry: StorageNodeRegistry
    ) {
        this.storageNodeRegistry = storageNodeRegistry as unknown as FakeStorageNodeRegistry
    }

    async fetchHttpStream(url: string): Promise<Readable> {
        const request = FakeHttpUtil.getResendRequest(url)
        if (request !== undefined) {
            const format = request.query!.get('format')
            if (format === 'raw') {
                const count = Number(request.query!.get('count'))
                const storageNode = await this.storageNodeRegistry.getRandomStorageNodeFor(request.streamPartId)
                let msgs: StreamMessage<unknown>[]
                if (request.resendType === 'last') {
                    msgs = await storageNode.getLast(request.streamPartId, count)
                } else if (request.resendType === 'range') {
                    msgs = await storageNode.getRange(request.streamPartId, {
                        fromTimestamp: Number(request.query!.get('fromTimestamp')),
                        fromSequenceNumber: Number(request.query!.get('fromSequenceNumber')),
                        toTimestamp: Number(request.query!.get('toTimestamp')),
                        toSequenceNumber: Number(request.query!.get('toSequenceNumber')),
                        publisherId: request.query!.get('publisherId')!,
                        msgChainId: request.query!.get('msgChainId')!
                    })
                } else {
                    throw new Error('not implemented: ' + JSON.stringify(request))
                }
                return Readable.from(msgs)
            }
        }
        throw new Error('not implemented: ' + url)
    }

    private static getResendRequest(url: string): ResendRequest | undefined {
        const resendLast = /streams\/(.+)\/data\/partitions\/(.+)\/([a-z]+)(\?.*)?$/
        const match = resendLast.exec(url)
        if (match !== null) {
            const [_, encodedStreamId, partition, resendType, queryParams] = match
            const streamId = decodeURIComponent(encodedStreamId) as StreamID
            const streamPartId = toStreamPartID(streamId, Number(partition))
            return {
                resendType,
                streamPartId,
                query: (queryParams !== undefined) ? new URLSearchParams(queryParams.substring(1)) : undefined
            }
            // eslint-disable-next-line no-else-return
        } else {
            return undefined
        }
    }
}
