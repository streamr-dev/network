import { Readable } from 'stream'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { StreamID, StreamMessage, StreamPartID, toStreamPartID } from 'streamr-client-protocol'
import { URLSearchParams } from 'url'
import { HttpUtil } from '../../../src/HttpUtil'
import { StreamStorageRegistry } from '../../../src/registry/StreamStorageRegistry'
import { FakeStreamStorageRegistry } from './FakeStreamStorageRegistry'

type ResendRequest = { resendType: string, streamPartId: StreamPartID, query?: URLSearchParams }

@scoped(Lifecycle.ContainerScoped)
export class FakeHttpUtil implements HttpUtil {
    private readonly realHttpUtil: HttpUtil
    private readonly streamStorageRegistry: FakeStreamStorageRegistry

    constructor(
        @inject(StreamStorageRegistry) streamStorageRegistry: StreamStorageRegistry
    ) {
        this.realHttpUtil = new HttpUtil()
        this.streamStorageRegistry = streamStorageRegistry as unknown as FakeStreamStorageRegistry
    }

    async fetchHttpStream(url: string): Promise<Readable> {
        const request = FakeHttpUtil.getResendRequest(url)
        if (request !== undefined) {
            const format = request.query!.get('format')
            if (format === 'raw') {
                const count = Number(request.query!.get('count'))
                const storageNode = await this.streamStorageRegistry.getRandomStorageNodeFor(request.streamPartId)
                let msgs: StreamMessage<unknown>[]
                if (request.resendType === 'last') {
                    msgs = await storageNode.getLast(request.streamPartId, count)
                } else if (request.resendType === 'range') {
                    msgs = await storageNode.getRange(request.streamPartId, {
                        fromTimestamp: Number(request.query!.get('fromTimestamp')),
                        fromSequenceNumber: Number(request.query!.get('fromSequenceNumber')),
                        toTimestamp: Number(request.query!.get('toTimestamp')),
                        toSequenceNumber: Number(request.query!.get('toSequenceNumber')),
                        publisherId: request.query!.get('publisherId') ?? undefined,
                        msgChainId: request.query!.get('msgChainId') ?? undefined
                    })
                } else {
                    throw new Error('not implemented: ' + JSON.stringify(request))
                }
                return Readable.from(msgs)
            }
        }
        throw new Error('not implemented: ' + url)
    }

    createQueryString(query: Record<string, any>): string {
        return this.realHttpUtil.createQueryString(query)
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
