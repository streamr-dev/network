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
    constructor(resendStrategies, sendResponse, notifyError) {
        if (resendStrategies == null) {
            throw new Error('resendStrategies not given')
        }
        if (sendResponse == null) {
            throw new Error('sendResponse not given')
        }
        if (notifyError == null) {
            throw new Error('notifyError not given')
        }

        this.resendStrategies = [...resendStrategies]
        this.sendResponse = sendResponse
        this.notifyError = notifyError
    }

    handleRequest(request, source) {
        const requestStream = new RequestStream()
        this._loopThruResendStrategies(request, source, requestStream)
        return requestStream
    }

    stop() {
        this.resendStrategies.forEach((resendStrategy) => {
            if (resendStrategy.stop) {
                resendStrategy.stop()
            }
        })
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
            this._sendResent(request, source)
        } else {
            this._sendNoResend(request, source)
        }

        requestStream.done(isRequestFulfilled)
    }

    _readStreamUntilEndOrError(responseStream, request, source) {
        let numOfMessages = 0
        return new Promise((resolve) => {
            responseStream
                .once('data', () => {
                    this._sendResending(request, source)
                })
                .on('data', () => {
                    numOfMessages += 1
                })
                .on('data', (unicastMessage) => {
                    this._sendUnicast(unicastMessage, source)
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

    _sendResending(request, source) {
        if (source != null) {
            this.sendResponse(source, ControlLayer.ResendResponseResending.create(
                request.streamId,
                request.streamPartition,
                request.subId
            ))
        }
    }

    _sendUnicast(unicastMessage, source) {
        if (source != null) {
            this.sendResponse(source, unicastMessage)
        }
    }

    _sendResent(request, source) {
        if (source != null) {
            this.sendResponse(source, ControlLayer.ResendResponseResent.create(
                request.streamId,
                request.streamPartition,
                request.subId
            ))
        }
    }

    _sendNoResend(request, source) {
        if (source != null) {
            this.sendResponse(source, ControlLayer.ResendResponseNoResend.create(
                request.streamId,
                request.streamPartition,
                request.subId
            ))
        }
    }

    _emitError(request, error) {
        this.notifyError(request, error)
    }
}

module.exports = ResendHandler
