import EventEmitter from 'eventemitter3'
import { ControlLayer } from 'streamr-client-protocol'
import Debug from 'debug'

import { uuid } from './utils'

const { ControlMessage } = ControlLayer

export default class ResendUtil extends EventEmitter {
    constructor({ debug } = {}) {
        super()
        this.debug = debug ? debug.extend('Util') : Debug('ResendUtil')
        this.subForRequestId = {}
    }

    /* eslint-disable-next-line class-methods-use-this */
    generateRequestId() {
        return uuid('r')
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
        if (response.type === ControlMessage.TYPES.ResendResponseResent || response.type === ControlMessage.TYPES.ResendResponseNoResend) {
            this.debug('remove', response.requestId)
            delete this.subForRequestId[response.requestId]
        }
    }

    registerResendRequestForSub(sub) {
        const requestId = this.generateRequestId()
        this.debug('add', requestId)
        this.subForRequestId[requestId] = sub
        sub.addPendingResendRequestId(requestId)
        return requestId
    }
}
