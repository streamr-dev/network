import EventEmitter = require("events")
import { IConnectionLayer } from './IConnectionLayer'
import { PeerID } from '../types'

export class MockConnectionLayer extends EventEmitter implements IConnectionLayer {
    constructor() {
        super()
    }

    send(peerId: PeerID, bytes: Uint8Array): void {
        console.info(peerId, bytes)
    }

}