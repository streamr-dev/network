const { Readable } = require('stream')
const { ControlLayer } = require('streamr-client-protocol')

class RequestStream extends Readable {
    constructor() {
        super({
            objectMode: true,
            read() {}
        })
        this.fulfilled = null
    }

    done(fulfilled) {
        this.fulfilled = fulfilled
        this.push(null)
    }
}

class ResendHandler {
    constructor(resendStrategies, sendResponse, sendUnicast, notifyError) {
        if (resendStrategies == null) {
            throw new Error('resendStrategies not given')
        }
        if (sendResponse == null) {
            throw new Error('sendResponse not given')
        }
        if (sendUnicast == null) {
            throw new Error('sendUnicast not given')
        }
        if (notifyError == null) {
            throw new Error('notifyError not given')
        }

        this.resendStrategies = [...resendStrategies]
        this.sendResponse = sendResponse
        this.sendUnicast = sendUnicast
        this.notifyError = notifyError
    }

    handleRequest(request, source) {
        const requestStream = new RequestStream()
        this._loopThruResendStrategies(request, source, requestStream)
        return requestStream
    }

    async _loopThruResendStrategies(request, source, requestStream) {
        let isRequestFulfilled = false

        for (let i = 0; i < this.resendStrategies.length && !isRequestFulfilled; ++i) {
            const responseStream = this.resendStrategies[i].getResendResponseStream(request, source)
                .on('data', requestStream.push.bind(requestStream))

            // eslint-disable-next-line no-await-in-loop
            isRequestFulfilled = await this._readStreamUntilEndOrError(responseStream, request, source)
        }

        if (isRequestFulfilled) {
            this._emitResent(request, source)
        } else {
            this._emitNoResend(request, source)
        }

        requestStream.done(isRequestFulfilled)
    }

    _readStreamUntilEndOrError(responseStream, request, source) {
        let numOfMessages = 0
        return new Promise((resolve) => {
            responseStream
                .once('data', () => {
                    this._emitResending(request, source)
                })
                .on('data', () => {
                    numOfMessages += 1
                })
                .on('data', ([unicastMessage, unicastMessageSource]) => {
                    this._emitUnicast(source, unicastMessage, unicastMessageSource)
                })
                .on('error', (error) => {
                    this._emitError(request, error)
                })
                .on('error', () => {
                    resolve(false)
                })
                .on('end', () => {
                    resolve(numOfMessages > 0)
                })
        })
    }

    _emitResending(request, source) {
        this.sendResponse(source, ControlLayer.ResendResponseResending.create(request.streamId, request.streamPartition, request.subId))
    }

    _emitUnicast(requestSource, unicastMessage, unicastMessageSource) {
        this.sendUnicast(requestSource, unicastMessage, unicastMessageSource)
    }

    _emitResent(request, source) {
        this.sendResponse(source, ControlLayer.ResendResponseResent.create(request.streamId, request.streamPartition, request.subId))
    }

    _emitNoResend(request, source) {
        this.sendResponse(source, ControlLayer.ResendResponseNoResend.create(request.streamId, request.streamPartition, request.subId))
    }

    _emitError(request, error) {
        this.notifyError(request, error)
    }
}

module.exports = ResendHandler
