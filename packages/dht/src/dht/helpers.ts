import { PeerID } from '../types'

export const generateId = (stringId: string): Uint8Array => {
    return Uint8Array.from(Buffer.from(stringId))
}

export const stringFromId = (id: PeerID): string => {
    return Buffer.from(id.buffer).toString()
}