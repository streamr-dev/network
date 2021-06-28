export interface PayloadFormat {
    createMessage: (payload: string) => Message|never
    createPayload: (content: any, metadata?: Metadata) => string|never
}

export interface Message {
    content: any
    metadata: Metadata
}

export interface Metadata {
    timestamp?: number
    sequenceNumber?: number
    publisherId?: string
    msgChainId?: string
}

const METADATA_FIELDS = [ 'timestamp', 'sequenceNumber', 'publisherId', 'msgChainId' ]

const pickProperties = (fields: string[], from: Record<string,unknown>): Record<string,unknown> => {
    const result: any = {}
    fields.forEach((field) => result[field] = from[field])
    return result
}

const assertContent = (content: any): void|never => {
    if ((content === undefined) || (content === null)) {
        throw new Error('Content missing')
    }
    if (!(content instanceof Array || content instanceof Object)) {
        throw new Error('Content is not an object or an array')
    }
}

const assertMetadata = (metadata: any): void|never => {
    if (!(metadata instanceof Object)) {
        throw new Error('Metadata is not an object')
    }
}

const parsePayloadJson = (payload: string) => {
    try {
        return JSON.parse(payload)
    } catch (e) {
        throw new Error(`Payload is not a JSON string: ${e.message}`)
    }
}

export class PlainPayloadFormat implements PayloadFormat {
    createMessage(payload: string): Message|never {
        return {
            content: parsePayloadJson(payload),
            metadata: {}
        }
    }

    createPayload(content: any): string|never {
        assertContent(content)
        return JSON.stringify(content)
    }
}

export class MetadataPayloadFormat implements PayloadFormat {

    createMessage(payload: string): Message|never {
        const json = parsePayloadJson(payload)
        const content = json.content
        assertContent(content)
        let metadata
        if (json.metadata !== undefined) {
            assertMetadata(json.metadata)
            metadata = pickProperties(METADATA_FIELDS, json.metadata)
        } else {
            metadata = {}
        }
        return { content, metadata }
    }

    createPayload(content: any, metadata?: Metadata): string|never {
        assertContent(content)
        const payload: any = {
            content
        }
        if (metadata !== undefined) {
            assertMetadata(metadata)
            payload.metadata = pickProperties(METADATA_FIELDS, metadata as Record<string,unknown>)
        }
        return JSON.stringify(payload)
    }
}

export const getPayloadFormat = (metadata: boolean) => {
    return metadata ? new MetadataPayloadFormat() : new PlainPayloadFormat()
}