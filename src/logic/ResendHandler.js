const { Readable } = require('stream')

class ResendHandler {
    constructor(resendStrategies, notifyError) {
        if (resendStrategies == null) {
            throw new Error('resendStrategies not given')
        }
        if (notifyError == null) {
            throw new Error('notifyError not given')
        }

        this.resendStrategies = [...resendStrategies]
        this.notifyError = notifyError
    }

    handleRequest(request, source) {
        const requestStream = new Readable({
            objectMode: true,
            read() {}
        })
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
            isRequestFulfilled = await this._readStreamUntilEndOrError(responseStream, request)
        }

        requestStream.push(null)
    }

    _readStreamUntilEndOrError(responseStream, request) {
        let numOfMessages = 0
        return new Promise((resolve) => {
            responseStream
                .on('data', () => {
                    numOfMessages += 1
                })
                .on('error', (error) => {
                    this.notifyError({
                        request,
                        error
                    })
                })
                .on('error', () => {
                    resolve(false)
                })
                .on('end', () => {
                    resolve(numOfMessages > 0)
                })
        })
    }
}

module.exports = ResendHandler
