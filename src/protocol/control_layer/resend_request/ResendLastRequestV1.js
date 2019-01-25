import ControlMessage from '../ControlMessage'
import ResendLastRequest from './ResendLastRequest'

const VERSION = 1

export default class ResendLastRequestV1 extends ResendLastRequest {
    constructor(streamId, streamPartition, subId, numberLast, sessionToken) {
        super(VERSION)
        this.streamId = streamId
        this.streamPartition = streamPartition
        this.subId = subId
        this.numberLast = numberLast
        this.sessionToken = sessionToken
    }

    toArray() {
        const array = super.toArray()
        array.push(...[
            this.streamId,
            this.streamPartition,
            this.subId,
            this.numberLast,
            this.sessionToken,
        ])
        return array
    }

    serialize() {
        return JSON.stringify(this.toArray())
    }
}

ControlMessage.registerClass(VERSION, ResendLastRequest.TYPE, ResendLastRequestV1)
