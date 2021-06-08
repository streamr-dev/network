import { Protocol } from 'streamr-network'

export interface Format {
    getMessageAsString: (streamMessage: Protocol.StreamMessage, version: number|undefined) => string
    contentType: string
    delimiter: string
    header: string
    footer: string
}

const createJsonFormat = (getMessageAsString: (streamMessage: Protocol.StreamMessage, version: number|undefined) => string): Format => {
    return {
        getMessageAsString,
        contentType: 'application/json',
        delimiter: ',',
        header: '[',
        footer: ']'
    }
}

const createPlainTextFormat = (getMessageAsString: (streamMessage: Protocol.StreamMessage, version: number|undefined) => string): Format => {
    return {
        getMessageAsString,
        contentType: 'text/plain',
        delimiter: '\n',
        header: '',
        footer: ''
    }
}

const FORMATS: Record<string,Format> = {
    // TODO could we deprecate protocol format?
    'protocol': createJsonFormat((streamMessage: Protocol.StreamMessage, version: number|undefined) => JSON.stringify(streamMessage.serialize(version))),
    'object': createJsonFormat((streamMessage: Protocol.StreamMessage) => JSON.stringify(streamMessage.toObject())),
    // the raw format message is the same string which we have we have stored to Cassandra (if the version numbers match)
    // -> TODO we could optimize the reading if we'd fetch the data from Cassandra as plain text
    // currently we:
    // 1) deserialize the string to an object in Storage._parseRow
    // 2) serialize the same object to string here
    'raw': createPlainTextFormat((streamMessage: Protocol.StreamMessage, version: number|undefined) => streamMessage.serialize(version))
}

export const getFormat = (id: string|undefined): Format|undefined => {
    const key = id ?? 'object'
    return FORMATS[key]
}