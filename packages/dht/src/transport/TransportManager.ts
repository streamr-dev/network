import { ITransport } from './ITransport'
import { PeerID } from '../types'

export class TransportManager implements ITransport{
    // private readonly connectivity: Connectivity
    constructor() {

    }

    send(peerId: PeerID, message: Uint8Array): boolean {
        return true
    }
}