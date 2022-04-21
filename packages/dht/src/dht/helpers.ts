import { PeerID } from '../types'

export const generateId = (stringId: string): Uint8Array => {
    return Uint8Array.from(Buffer.from(stringId))
}

export const stringFromId = (id: PeerID): string => {
    console.log(Buffer.from(id).toString())
    return Buffer.from(id.buffer).toString()
}