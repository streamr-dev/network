/* eslint-disable no-console */

import { Message, PeerDescriptor } from '../proto/DhtRpc'
import { EventEmitter } from 'events'
import { IConnectionManager } from './IConnectionManager'

export class MockConnectionManager extends EventEmitter implements IConnectionManager {
    constructor() {
        super()
    }

    send(peerDescriptor: PeerDescriptor, msg: Message): void {
        console.info(peerDescriptor, msg)
    }

}