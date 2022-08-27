import { EncryptionType, StreamID, StreamMessageType } from 'streamr-client-protocol'
import { inspect } from '../utils/log'
import { InspectOptions } from 'util'

// TODO move all classes/interfaces to Publisher.ts

export class PublishError extends Error {
    
    public streamId: StreamID
    public timestamp: number

    constructor(streamId: StreamID, timestamp: number, cause: Error) {
        // Currently Node and Firefox show the full error chain (this error and
        // the message and the stack of the "cause" variable) when an error is printed
        // to console.log. Chrome shows only the root error.
        // TODO: Remove the cause suffix from the error message when Chrome adds the support:
        // https://bugs.chromium.org/p/chromium/issues/detail?id=1211260
        // eslint-disable-next-line max-len
        // @ts-expect-error typescript definitions don't support error cause
        super(`Failed to publish to stream ${streamId} (timestamp=${timestamp}), cause: ${cause.message}`, { cause })
        this.streamId = streamId
        this.timestamp = timestamp
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }

    [Symbol.for('nodejs.util.inspect.custom')](depth: number, options: InspectOptions): string {
        return inspect(this, {
            ...options,
            customInspect: false,
            depth,
        })
    }
}

export interface MessageMetadata {
    timestamp?: string | number | Date
    partitionKey?: string | number
    msgChainId?: string
    /** @internal */
    messageType?: StreamMessageType
    /** @internal */
    encryptionType?: EncryptionType
}
