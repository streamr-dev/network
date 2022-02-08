import { Readable } from 'stream'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { StreamID, toStreamPartID } from 'streamr-client-protocol'
import { FakeStorageNodeRegistry } from './FakeStorageNodeRegistry'
import { FetchOptions, UrlParts } from '../../../src/Rest'
import { StorageNodeRegistry } from '../../../src/StorageNodeRegistry'

@scoped(Lifecycle.ContainerScoped)
export class FakeRest {

    private storageNodeRegistry: FakeStorageNodeRegistry

    constructor(
        @inject(StorageNodeRegistry) storageNodeRegistry: StorageNodeRegistry
    ) {
        this.storageNodeRegistry = storageNodeRegistry as unknown as FakeStorageNodeRegistry
    }

    async get<T extends object>(urlParts: UrlParts, options: FetchOptions = {}): Promise<T> {
        const url = urlParts.map((p) => encodeURIComponent(p)).join('/')
        const request = FakeRest.getResendRequest(url)
        if ((request !== undefined) && (request.resendType === 'last')) {
            const { count, format } = options.query!
            if (format === undefined) { // by default in "object" format
                const storageNode = await this.storageNodeRegistry.getRandomStorageNodeFor(request.streamPartId)
                const msgs = await storageNode.getLast(request.streamPartId, count)
                return msgs.map((m) => m.toObject()) as any
            }
        }
        throw new Error('not implemented: ' + url)
    }

    // TODO reduce copy-paste between get() and fetchStream()
    async fetchStream(url: string): Promise<Readable> {
        const request = FakeRest.getResendRequest(url)
        if (request !== undefined) {
            if (request.resendType === 'last') {
                const format = request.query!.get('format')
                if (format === 'raw') {
                    const count = Number(request.query!.get('count'))
                    const storageNode = await this.storageNodeRegistry.getRandomStorageNodeFor(request.streamPartId)
                    const msgs = await storageNode.getLast(request.streamPartId, count)
                    return Readable.from(msgs)
                }
            }
        }
        throw new Error('not implemented: ' + url)
    }

    private static getResendRequest(url: string) {
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

    // TODO implement other public methods of Rest
}
