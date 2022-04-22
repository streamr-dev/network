/* eslint-disable no-console */

import { PeerDescriptor } from '../proto/DhtRpc'
import { EventEmitter } from 'events'
import { IConnectionManager } from './IConnectionManager'

export class MockConnectionManager extends EventEmitter implements IConnectionManager {
    constructor() {
        super()
    }

    send(peerDescriptor: PeerDescriptor, bytes: Uint8Array): void {
        console.info(peerDescriptor, bytes)
    }

}