export interface PayloadFormat {
    createMessage: (payload: string) => Message
    createPayload: (content: any, metadata?: Metadata) => string
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

const pickProperties = (fields: string[], from: any) => {
    const result: any = {}
    fields.forEach((field) => result[field] = from[field])
    return result
}

const assertContent = (content: any) => {
    if ((content === undefined) || (content === null)) {
        throw new Error('Content missing')
    }
    if (!(content instanceof Array || content instanceof Object)) {
        throw new Error('Content is not an object or an array')
    }
}

const assertMetadata = (metadata: any) => {
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
    createMessage(payload: string): Message {
        return {
            content: parsePayloadJson(payload),
            metadata: {}
        }
    }

    createPayload(content: any): string {
        assertContent(content)
        return JSON.stringify(content)
    }
}

export class MetadataPayloadFormat implements PayloadFormat {

    private static FIELDS = [ 'timestamp', 'sequenceNumber', 'publisherId', 'msgChainId' ]

    createMessage(payload: string): Message {
        const json = parsePayloadJson(payload)
        const content = json.content
        assertContent(content)
        let metadata
        if (json.metadata !== undefined) {
            assertMetadata(json.metadata)
            metadata = pickProperties(MetadataPayloadFormat.FIELDS, json.metadata)
        } else {
            metadata = {}
        }
        return { content, metadata }
    }

    createPayload(content: any, metadata?: Metadata): string {
        assertContent(content)
        const payload: any = {
            content
        }
        if (metadata !== undefined) {
            assertMetadata(metadata)
            payload.metadata = pickProperties(MetadataPayloadFormat.FIELDS, metadata)
        }
        return JSON.stringify(payload)
    }
}

export const getPayloadFormat = (metadata: boolean) => {
    return metadata ? new MetadataPayloadFormat() : new PlainPayloadFormat()
}