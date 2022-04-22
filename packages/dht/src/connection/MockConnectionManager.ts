/* eslint-disable no-console */

import { EventEmitter } from 'events'
import { IConnectionManager } from './IConnectionManager'
import { PeerID } from '../types'

export class MockConnectionManager extends EventEmitter implements IConnectionManager {
    constructor() {
        super()
    }

    send(peerId: PeerID, bytes: Uint8Array): void {
        console.info(peerId, bytes)
    }

}