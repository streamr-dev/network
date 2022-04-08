import { PeerID } from '../types'

export interface ITransport {
    send(peerId: PeerID, message: Uint8Array | any): boolean
}