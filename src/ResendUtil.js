import EventEmitter from 'eventemitter3'
import { ControlLayer } from 'streamr-client-protocol'

export default class ResendUtil extends EventEmitter {
    constructor() {
        super()
        this.subForRequestId = {}
        this.counter = 0
    }

    generateRequestId() {
        const id = this.counter
        this.counter += 1
        return id.toString()
    }

    _subForRequestIdExists(requestId) {
        return requestId in this.subForRequestId
    }

    getSubFromResendResponse(response) {
        if (!this._subForRequestIdExists(response.requestId)) {
            const error = new Error(`Received unexpected ${response.constructor.name} message ${response.serialize()}`)
            this.emit('error', error)
        }

        return this.subForRequestId[response.requestId]
    }

    deleteDoneSubsByResponse(response) {
        // TODO: replace with response.requestId
        if (response.type === ControlLayer.ResendResponseResent.TYPE || response.type === ControlLayer.ResendResponseNoResend.TYPE) {
            delete this.subForRequestId[response.requestId]
        }
    }

    registerResendRequestForSub(sub) {
        const requestId = this.generateRequestId()
        this.subForRequestId[requestId] = sub
        sub.addPendingResendRequestId(requestId)
        return requestId
    }
}
