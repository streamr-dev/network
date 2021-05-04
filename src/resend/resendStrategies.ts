import { Transform, Readable } from 'stream'
import { ControlLayer } from 'streamr-client-protocol'
import { ResendRequest } from '../identifiers'
import { Logger } from '../helpers/Logger'
import { Strategy } from './ResendHandler'
import { Storage } from '../composition'

// TODO: move to use peerId-based logger for better traceability
const staticLogger = new Logger(['resend', 'resendStrategies'])

function toUnicastMessage(request: ResendRequest): Transform {
    return new Transform({
        objectMode: true,
        transform: (streamMessage, _, done) => {
            done(null, new ControlLayer.UnicastMessage({
                requestId: request.requestId,
                streamMessage
            }))
        }
    })
}

/**
 * Resend strategy that uses fetches streaming data from local storage.
 */
export class LocalResendStrategy implements Strategy {
    private readonly storage: Storage

    constructor(storage: Storage) {
        if (storage == null) {
            throw new Error('storage not given')
        }
        this.storage = storage
        staticLogger.debug('LocalResendStrategy (L1) constructed')
    }

    getResendResponseStream(request: ResendRequest): Readable {
        let sourceStream: Readable
        if (request.type === ControlLayer.ControlMessage.TYPES.ResendLastRequest) {
            const lastRequest = request as ControlLayer.ResendLastRequest
            sourceStream = this.storage.requestLast(
                lastRequest.streamId,
                lastRequest.streamPartition,
                lastRequest.numberLast
            )
        } else if (request.type === ControlLayer.ControlMessage.TYPES.ResendFromRequest) {
            const fromRequest = request as ControlLayer.ResendFromRequest
            sourceStream = this.storage.requestFrom(
                fromRequest.streamId,
                fromRequest.streamPartition,
                fromRequest.fromMsgRef.timestamp,
                fromRequest.fromMsgRef.sequenceNumber,
                fromRequest.publisherId,
                null // TODO: msgChainId is not used, remove on NET-143
            )
        } else if (request.type === ControlLayer.ControlMessage.TYPES.ResendRangeRequest) {
            const rangeRequest = request as ControlLayer.ResendRangeRequest
            sourceStream = this.storage.requestRange(
                rangeRequest.streamId,
                rangeRequest.streamPartition,
                rangeRequest.fromMsgRef.timestamp,
                rangeRequest.fromMsgRef.sequenceNumber,
                rangeRequest.toMsgRef.timestamp,
                rangeRequest.toMsgRef.sequenceNumber,
                rangeRequest.publisherId,
                rangeRequest.msgChainId
            )
        } else {
            throw new Error(`unknown resend request ${request}`)
        }

        const destinationStream = toUnicastMessage(request)
        destinationStream.on('close', () => {
            if (destinationStream.destroyed) {
                sourceStream.destroy()
            }
        })
        return sourceStream.pipe(destinationStream)
    }
}