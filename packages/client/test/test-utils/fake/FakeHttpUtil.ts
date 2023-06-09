import { EthereumAddress } from '@streamr/utils'
import { StreamID, StreamMessage, StreamPartID, toStreamPartID } from '@streamr/protocol'
import { URLSearchParams } from 'url'
import { HttpUtil } from '../../../src/HttpUtil'
import { FakeNetwork } from './FakeNetwork'
import { FakeStorageNode, parseNodeIdFromStorageNodeUrl } from './FakeStorageNode'
import { mockLoggerFactory } from '../utils'

const MAX_TIMESTAMP_VALUE = 8640000000000000 // https://262.ecma-international.org/5.1/#sec-15.9.1.1
const MAX_SEQUENCE_NUMBER_VALUE = 2147483647

interface ResendRequest {
    nodeId: EthereumAddress
    resendType: string
    streamPartId: StreamPartID
    query?: URLSearchParams
}

export class FakeHttpUtil extends HttpUtil {

    private readonly network: FakeNetwork

    constructor(network: FakeNetwork) {
        super(mockLoggerFactory())
        this.network = network
    }

    override async* fetchHttpStream(url: string): AsyncIterable<StreamMessage> {
        const request = FakeHttpUtil.getResendRequest(url)
        if (request !== undefined) {
            const storageNode = this.network.getNode(request.nodeId) as FakeStorageNode
            const format = request.query!.get('format')
            if (format === 'raw') {
                const count = Number(request.query!.get('count'))
                if (request.resendType === 'last') {
                    yield* storageNode.getLast(request.streamPartId, count)
                } else if (request.resendType === 'range') {
                    yield* storageNode.getRange(request.streamPartId, {
                        fromTimestamp: Number(request.query!.get('fromTimestamp')),
                        fromSequenceNumber: Number(request.query!.get('fromSequenceNumber')),
                        toTimestamp: Number(request.query!.get('toTimestamp')),
                        toSequenceNumber: Number(request.query!.get('toSequenceNumber')),
                        publisherId: request.query!.get('publisherId') ?? undefined,
                        msgChainId: request.query!.get('msgChainId') ?? undefined
                    })
                } else if (request.resendType === 'from') {
                    yield* storageNode.getRange(request.streamPartId, {
                        fromTimestamp: Number(request.query!.get('fromTimestamp')),
                        fromSequenceNumber: Number(request.query!.get('fromSequenceNumber')),
                        toTimestamp: MAX_TIMESTAMP_VALUE,
                        toSequenceNumber: MAX_SEQUENCE_NUMBER_VALUE,
                        publisherId: request.query!.get('publisherId') ?? undefined,
                        msgChainId: undefined
                    })
                } else {
                    throw new Error(`assertion failed: resendType=${request.resendType}`)
                }
            } else {
                throw new Error(`not implemented: format=${format} ${url}`)
            }
        } else {
            throw new Error(`not implemented: ${url}`)
        }
    }

    private static getResendRequest(url: string): ResendRequest | undefined {
        const resendLast = /streams\/(.+)\/data\/partitions\/(.+)\/([a-z]+)(\?.*)?$/
        const match = resendLast.exec(url)
        if (match !== null) {
            const [_, encodedStreamId, partition, resendType, queryParams] = match
            const streamId = decodeURIComponent(encodedStreamId) as StreamID
            const streamPartId = toStreamPartID(streamId, Number(partition))
            return {
                nodeId: parseNodeIdFromStorageNodeUrl(url),
                resendType,
                streamPartId,
                query: (queryParams !== undefined) ? new URLSearchParams(queryParams.substring(1)) : undefined
            }
        } else {
            return undefined
        }
    }
}
