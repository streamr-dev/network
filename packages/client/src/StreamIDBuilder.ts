import {
    StreamID,
    StreamIDUtils,
    StreamPartID,
    StreamPartIDUtils,
    toStreamID,
    toStreamPartID
} from 'streamr-client-protocol'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { StreamDefinition } from './types'
import { Authentication, AuthenticationInjectionToken } from './Authentication'
import { EthereumAddress } from '@streamr/utils'

export const DEFAULT_PARTITION = 0

function pickStreamId(definition: { id: string } | { stream: string } | { streamId: string }): StreamID {
    const obj = definition as any
    if (obj.id !== undefined) {
        return obj.id
    } else if (obj.stream !== undefined) {
        return obj.stream
    } else if (obj.streamId !== undefined) {
        return obj.streamId
    } else {
        throw new Error('streamDefinition: object must have property: "id", "stream", or "streamId"')
    }
}

function parseRawDefinition(definition: StreamDefinition): [string, number | undefined] | never {
    if (typeof definition === 'string') {
        return StreamPartIDUtils.parseRawElements(definition)
    } else if (typeof definition === 'object') {
        return [pickStreamId(definition), definition.partition]
    } else {
        throw new Error('streamDefinition: must be of type string or object')
    }
}

@scoped(Lifecycle.ContainerScoped)
export class StreamIDBuilder {
    constructor(@inject(AuthenticationInjectionToken) private authentication: Authentication) {}

    async toStreamID(streamIdOrPath: string): Promise<StreamID> {
        let address: EthereumAddress | undefined
        if (StreamIDUtils.isPathOnlyFormat(streamIdOrPath) && this.authentication.isAuthenticated()) {
            address = await this.authentication.getAddress()
        }
        return toStreamID(streamIdOrPath, address)
    }

    async toStreamPartID(definition: StreamDefinition): Promise<StreamPartID> {
        const [streamId, streamPartition] = await this.toStreamPartElements(definition)
        return toStreamPartID(streamId, streamPartition ?? DEFAULT_PARTITION)
    }

    async toStreamPartElements(definition: StreamDefinition): Promise<[StreamID, number | undefined]> {
        const [streamId, streamPartition] = parseRawDefinition(definition)
        return [await this.toStreamID(streamId), streamPartition]
    }

    async match(definition: StreamDefinition, streamPartId: StreamPartID): Promise<boolean> {
        const [targetStreamId, targetPartition] = await this.toStreamPartElements(definition)
        return targetStreamId === StreamPartIDUtils.getStreamID(streamPartId)
            && (
                targetPartition === undefined || targetPartition === StreamPartIDUtils.getStreamPartition(streamPartId)
            )
    }
}
