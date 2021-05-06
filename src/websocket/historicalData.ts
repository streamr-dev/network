import qs from 'qs'
import { Protocol } from 'streamr-network'
import split2 from 'split2'
import fetch from 'node-fetch'
import AbortController from 'abort-controller'
const { ControlLayer } = Protocol
import { MAX_SEQUENCE_NUMBER_VALUE, MIN_SEQUENCE_NUMBER_VALUE } from '../http/DataQueryEndpoints'
import { StorageNodeRegistry } from '../StorageNodeRegistry'
import { GenericError } from '../errors/GenericError'

type ResendLastRequest = Protocol.ControlLayer.ResendLastRequest
type ResendFromRequest = Protocol.ControlLayer.ResendFromRequest
type ResendRangeRequest = Protocol.ControlLayer.ResendRangeRequest

export interface HistoricalDataResponse {
    data: NodeJS.ReadableStream
    abort: () => void
    startTime: number
}

const getDataQueryEndpointUrl = (request: ResendFromRequest|ResendLastRequest|ResendRangeRequest, baseUrl: string) => {
    const createUrl = (endpointSuffix: string, query: any) => {
        const queryParameters = qs.stringify({
            ...query,
            format: 'raw'
        }, { skipNulls: true })
        return `${baseUrl}/streams/${encodeURIComponent(request.streamId)}/data/partitions/${request.streamPartition}/${endpointSuffix}?${queryParameters}`
    }
    let r
    switch (request.type) {
        case ControlLayer.ControlMessage.TYPES.ResendLastRequest:
            r = request as ResendLastRequest
            return createUrl('last', {
                count: r.numberLast
            })
        case ControlLayer.ControlMessage.TYPES.ResendFromRequest:
            r = request as ResendFromRequest
            return createUrl('from', {
                fromTimestamp: r.fromMsgRef.timestamp,
                // TODO client should provide sequenceNumber, remove MIN_SEQUENCE_NUMBER_VALUE defaults when NET-267 have been implemented
                fromSequenceNumber: r.fromMsgRef.sequenceNumber ?? MIN_SEQUENCE_NUMBER_VALUE,
                publisherId: r.publisherId,
            })
        case ControlLayer.ControlMessage.TYPES.ResendRangeRequest:
            r = request as ResendRangeRequest
            return createUrl('range', {
                fromTimestamp: r.fromMsgRef.timestamp,
                // TODO client should provide sequenceNumber, remove MIN_SEQUENCE_NUMBER_VALUE&MAX_SEQUENCE_NUMBER_VALUE defaults when NET-267 have been implemented
                fromSequenceNumber: r.fromMsgRef.sequenceNumber ?? MIN_SEQUENCE_NUMBER_VALUE,
                toTimestamp: r.toMsgRef.timestamp,
                toSequenceNumber: r.toMsgRef.sequenceNumber ?? MAX_SEQUENCE_NUMBER_VALUE,
                publisherId: r.publisherId,
                msgChainId: r.msgChainId 
            })
        default: 
            throw new Error('Assertion failed: request.type=' + request.type)
    }
}

export const createResponse = async (
    request: ResendFromRequest|ResendLastRequest|ResendRangeRequest,
    storageNodeRegistry: StorageNodeRegistry
): Promise<HistoricalDataResponse> => {
    const storageNodeUrl = await storageNodeRegistry.getUrlByStreamId(request.streamId)
    const url = getDataQueryEndpointUrl(request, `${storageNodeUrl}/api/v1`)
    const abortController = new AbortController();
    const response = await fetch(url, {
        headers: {
            Authorization: 'Bearer ' + request.sessionToken
        },
        signal: abortController.signal
    })
    if (response.status === 200) {
        const data = response.body.pipe(split2((message: string) => Protocol.StreamMessage.deserialize(message)))
        return {
            data,
            abort: () => {
                data.destroy()
                abortController.abort()
            },
            startTime: Date.now()
        }
    } else {
        return Promise.reject(new GenericError(`Storage node fetch error: ${response.status} ${url}`, 'STORAGE_NODE_FETCH_ERROR'))
    }
}