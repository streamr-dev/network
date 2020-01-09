const { Readable } = require('stream')

class ResendBookkeeper {
    constructor() {
        this.resends = {} // nodeId => Set[Ctx]
    }

    add(node, ctx) {
        if (this.resends[node] == null) {
            this.resends[node] = new Set()
        }
        this.resends[node].add(ctx)
    }

    popContexts(node) {
        if (this.resends[node] == null) {
            return []
        }
        const contexts = this.resends[node]
        delete this.resends[node]
        return [...contexts]
    }

    delete(node, ctx) {
        if (this.resends[node] != null) {
            this.resends[node].delete(ctx)
            if (this.resends[node].size === 0) {
                delete this.resends[node]
            }
        }
    }

    size() {
        return Object.values(this.resends).reduce((acc, ctxs) => acc + ctxs.size, 0)
    }

    meanAge() {
        const now = Date.now()
        const ages = []
        Object.values(this.resends).forEach((ctxts) => {
            ctxts.forEach((ctx) => {
                ages.push(now - ctx.startTime)
            })
        })
        return ages.length === 0 ? 0 : ages.reduce((acc, x) => acc + x, 0) / ages.length
    }
}

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
        this.ongoingResends = new ResendBookkeeper()
    }

    handleRequest(request, source) {
        const requestStream = new Readable({
            objectMode: true,
            read() {}
        })
        this._loopThruResendStrategies(request, source, requestStream)
        return requestStream
    }

    cancelResendsOfNode(node) {
        const contexts = this.ongoingResends.popContexts(node)
        contexts.forEach((ctx) => ctx.cancel())
        return contexts.map((ctx) => ctx.request)
    }

    stop() {
        Object.keys(this.ongoingResends).forEach((node) => {
            this.cancelResendsOfNode(node)
        })
        this.resendStrategies.forEach((resendStrategy) => {
            if (resendStrategy.stop) {
                resendStrategy.stop()
            }
        })
    }

    metrics() {
        return {
            numOfOngoingResends: this.ongoingResends.size(),
            meanAge: this.ongoingResends.meanAge()
        }
    }

    async _loopThruResendStrategies(request, source, requestStream) {
        const ctx = {
            request,
            startTime: Date.now(),
            stop: false,
            responseStream: null,
            cancel: () => {
                ctx.stop = true
                if (ctx.responseStream != null) {
                    ctx.responseStream.destroy()
                }
            }
        }
        this.ongoingResends.add(source, ctx)

        try {
            // cancel resend if requestStream has been destroyed by user
            requestStream.on('close', () => {
                if (requestStream.destroyed) {
                    ctx.cancel()
                }
            })

            for (let i = 0; i < this.resendStrategies.length && !ctx.stop; ++i) {
                ctx.responseStream = this.resendStrategies[i].getResendResponseStream(request, source)
                    .on('data', requestStream.push.bind(requestStream))

                // eslint-disable-next-line no-await-in-loop
                if (await this._readStreamUntilEndOrError(ctx.responseStream, request)) {
                    ctx.stop = true
                }
            }

            requestStream.push(null)
        } finally {
            this.ongoingResends.delete(source, ctx)
        }
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
                .on('close', () => {
                    resolve(numOfMessages > 0)
                })
        })
    }
}

module.exports = ResendHandler
