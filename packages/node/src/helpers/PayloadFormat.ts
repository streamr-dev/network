import { MessageMetadata } from '@streamr/sdk'

export interface PayloadFormat {
    createMessage: (payload: string) => Message | never
    createPayload: (content: Record<string, unknown>, metadata?: Metadata) => string | never
}

export interface Message {
    content: Record<string, unknown>
    metadata: Metadata
}

export type Metadata = Partial<Pick<MessageMetadata, 'timestamp' | 'sequenceNumber' | 'publisherId' | 'msgChainId'>>

const METADATA_FIELDS = ['timestamp', 'sequenceNumber', 'publisherId', 'msgChainId']

const pickProperties = (fields: string[], from: Record<string, unknown>): Record<string, unknown> => {
    const result: any = {}
    fields.forEach((field) => (result[field] = from[field]))
    return result
}

const isJavascriptObject = (content: any): boolean => {
    return content instanceof Object && !(content instanceof Array)
}

const assertContent = (content: any): void | never => {
    if (content === undefined || content === null) {
        throw new Error('Content missing')
    }
    if (!isJavascriptObject(content)) {
        throw new Error('Content is not an object')
    }
}

const assertMetadata = (metadata: any): void | never => {
    if (!isJavascriptObject(metadata)) {
        throw new Error('Metadata is not an object')
    }
}

const parsePayloadJson = (payload: string) => {
    if (payload.length === 0) {
        throw new Error('Payload missing')
    }
    try {
        return JSON.parse(payload)
    } catch (e) {
        // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
        throw new Error(`Payload is not a JSON string: ${e.message}`)
    }
}

/* eslint-disable class-methods-use-this */
export class PlainPayloadFormat implements PayloadFormat {
    createMessage(payload: string): Message | never {
        const content = parsePayloadJson(payload)
        assertContent(content)
        return {
            content,
            metadata: {}
        }
    }

    createPayload(content: Record<string, unknown>): string | never {
        assertContent(content)
        return JSON.stringify(content)
    }
}

export class MetadataPayloadFormat implements PayloadFormat {
    createMessage(payload: string): Message | never {
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

    createPayload(content: Record<string, unknown>, metadata?: Metadata): string | never {
        assertContent(content)
        const payload: any = {
            content
        }
        if (metadata !== undefined) {
            assertMetadata(metadata)
            payload.metadata = pickProperties(METADATA_FIELDS, metadata as Record<string, unknown>)
        }
        return JSON.stringify(payload)
    }
}

export const getPayloadFormat = (metadata: boolean): PayloadFormat => {
    return metadata ? new MetadataPayloadFormat() : new PlainPayloadFormat()
}
