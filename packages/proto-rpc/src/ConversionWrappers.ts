import { Err } from './errors'

export const parseWrapper = <T>(parseFn: () => T): T | never => {
    try {
        return parseFn()
    } catch (err) {
        throw new Err.FailedToParse(`Could not parse binary to JSON-object`, err)
    }
}

export const serializeWrapper = (serializerFn: () => Uint8Array): Uint8Array | never => {
    try {
        return serializerFn()
    } catch (err) {
        throw new Err.FailedToSerialize(`Could not serialize message to binary`, err)
    }
}
