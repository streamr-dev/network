const { Readable } = require('stream')
const ResendResponseNoResend = require('../../src/messages/ResendResponseNoResend')
const ResendResponseResent = require('../../src/messages/ResendResponseResent')
const ResendResponseResending = require('../../src/messages/ResendResponseResending')

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

    handleRequest(request) {
        const requestStream = new RequestStream()
        this._loopThruResendStrategies(request, requestStream)
        return requestStream
    }

    async _loopThruResendStrategies(request, requestStream) {
        let isRequestFulfilled = false

        for (let i = 0; i < this.resendStrategies.length && !isRequestFulfilled; ++i) {
            const responseStream = this.resendStrategies[i].getResendResponseStream(request)
                .on('data', requestStream.push.bind(requestStream))

            // eslint-disable-next-line no-await-in-loop
            isRequestFulfilled = await this._readStreamUntilEndOrError(responseStream, request)
        }

        if (isRequestFulfilled) {
            this._emitResent(request)
        } else {
            this._emitNoResend(request)
        }

        requestStream.done(isRequestFulfilled)
    }

    _readStreamUntilEndOrError(responseStream, request) {
        let numOfMessages = 0
        return new Promise((resolve) => {
            responseStream
                .once('data', () => {
                    this._emitResending(request)
                })
                .on('data', () => {
                    numOfMessages += 1
                })
                .on('data', (data) => {
                    this._emitUnicast(request, data)
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

    _emitResending(request) {
        this.sendResponse(request.getSource(), new ResendResponseResending(request.getStreamId(), request.getSubId()))
    }

    _emitUnicast(request, unicastMessage) {
        this.sendUnicast(request.getSource(), unicastMessage)
    }

    _emitResent(request) {
        this.sendResponse(request.getSource(), new ResendResponseResent(request.getStreamId(), request.getSubId()))
    }

    _emitNoResend(request) {
        this.sendResponse(request.getSource(), new ResendResponseNoResend(request.getStreamId(), request.getSubId()))
    }

    _emitError(request, error) {
        this.notifyError(request, error)
    }
}

module.exports = ResendHandler
