/* eslint-disable no-console */

import { Message, PeerDescriptor } from '../proto/DhtRpc'
import { EventEmitter } from 'events'
import { ITransport } from '../transport/ITransport'

export class MockConnectionManager extends EventEmitter implements ITransport {
    constructor() {
        super()
    }

    send(peerDescriptor: PeerDescriptor, msg: Message): void {
        console.info(peerDescriptor, msg)
    }

}