import { Err } from '../helpers/errors'

export const parser = <T>(message: Uint8Array, parseFn: (bytes: Uint8Array) => T): T | never => {
    try {
        return parseFn(message)
    } catch (err) {
        throw new Err.FailedToParse(`Could not parse binary with to message of type ${T.toString()}`, err)
    }
}

export const serializer = <T>(message: T, serializerFn: (message: T) => Uint8Array): Uint8Array | never => {
    try {
        return serializerFn(message)
    } catch (err) {
        throw new Err.FailedToSerialize(`Could not serialize message with type ${T.toString()} to binary`, err)
    }
}
