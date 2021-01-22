import { MetricsContext, Metrics } from '../helpers/MetricsContext'
import { Readable } from 'stream'
import { ResendRequest } from '../identifiers'

export interface Strategy {
    getResendResponseStream: (request: ResendRequest, source: string | null) => Readable
    stop?: () => void
}

interface Context {
    startTime: number
    request: ResendRequest
    stop: boolean
    responseStream: Readable | null
    pause: () => void
    resume: () => void
    cancel: () => void
}

class ResendBookkeeper {
    private readonly resends: { [key: string]: Set<Context> } = {} // nodeId => Set[Ctx]

    add(node: string | null, ctx: Context): void {
        if (this.resends[node || 'null'] == null) {
            this.resends[node || 'null'] = new Set()
        }
        this.resends[node || 'null'].add(ctx)
    }

    getContexts(node: string | null): ReadonlyArray<Context> {
        if (this.resends[node || 'null'] == null) {
            return []
        }
        return [...this.resends[node || 'null']]
    }

    popContexts(node: string | null): ReadonlyArray<Context> {
        const contexts = this.getContexts(node)
        delete this.resends[node || 'null']
        return contexts
    }

    delete(node: string | null, ctx: Context): void {
        if (this.resends[node || 'null'] != null) {
            this.resends[node || 'null'].delete(ctx)
            if (this.resends[node || 'null'].size === 0) {
                delete this.resends[node || 'null']
            }
        }
    }

    size(): number {
        return Object.values(this.resends).reduce((acc, ctxs) => acc + ctxs.size, 0)
    }

    meanAge(): number {
        const now = Date.now()
        const ages: Array<number> = []
        Object.values(this.resends).forEach((ctxts) => {
            ctxts.forEach((ctx) => {
                ages.push(now - ctx.startTime)
            })
        })
        return ages.length === 0 ? 0 : ages.reduce((acc, x) => acc + x, 0) / ages.length
    }
}

export class ResendHandler {
    private readonly resendStrategies: Strategy[]
    private readonly notifyError: (opts: { request: ResendRequest, error: Error }) => void
    private readonly maxInactivityPeriodInMs: number
    private readonly ongoingResends: ResendBookkeeper
    private readonly metrics: Metrics

    constructor(
        resendStrategies: Strategy[],
        notifyError: (opts: { request: ResendRequest, error: Error }) => void,
        metricsContext = new MetricsContext(''),
        maxInactivityPeriodInMs = 5 * 60 * 1000
    ) {
        if (resendStrategies == null) {
            throw new Error('resendStrategies not given')
        }
        if (notifyError == null) {
            throw new Error('notifyError not given')
        }

        this.resendStrategies = [...resendStrategies]
        this.notifyError = notifyError
        this.maxInactivityPeriodInMs = maxInactivityPeriodInMs
        this.ongoingResends = new ResendBookkeeper()
        this.metrics = metricsContext.create('resends')
            .addQueriedMetric('numOfOngoingResends', () => this.ongoingResends.size())
            .addQueriedMetric('meanAge', () => this.ongoingResends.meanAge())
    }

    handleRequest(request: ResendRequest, source: string | null): Readable {
        const requestStream = new Readable({
            objectMode: true,
            read() {}
        })
        this.loopThruResendStrategies(request, source, requestStream)
        return requestStream
    }

    pauseResendsOfNode(node: string): void {
        const contexts = this.ongoingResends.getContexts(node)
        contexts.forEach((ctx) => ctx.pause())
    }

    resumeResendsOfNode(node: string): void {
        const contexts = this.ongoingResends.getContexts(node)
        contexts.forEach((ctx) => ctx.resume())
    }

    cancelResendsOfNode(node: string): ReadonlyArray<ResendRequest> {
        const contexts = this.ongoingResends.popContexts(node)
        contexts.forEach((ctx) => ctx.cancel())
        return contexts.map((ctx) => ctx.request)
    }

    stop(): void {
        Object.keys(this.ongoingResends).forEach((node) => {
            this.cancelResendsOfNode(node)
        })
        this.resendStrategies.forEach((resendStrategy) => {
            if (resendStrategy.stop) {
                resendStrategy.stop()
            }
        })
    }

    private async loopThruResendStrategies(
        request: ResendRequest,
        source: string | null,
        requestStream: Readable
    ): Promise<void> {
        const ctx: Context = {
            request,
            startTime: Date.now(),
            stop: false,
            responseStream: null,
            pause: () => requestStream.pause(),
            resume: () => requestStream.resume(),
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
            requestStream.on('pause', () => {
                if (ctx.responseStream) {
                    ctx.responseStream.pause()
                }
            })
            requestStream.on('resume', () => {
                if (ctx.responseStream) {
                    ctx.responseStream.resume()
                }
            })

            for (let i = 0; i < this.resendStrategies.length && !ctx.stop; ++i) {
                ctx.responseStream = this.resendStrategies[i].getResendResponseStream(request, source)
                    .on('data', requestStream.push.bind(requestStream))

                if (await this.readStreamUntilEndOrError(ctx.responseStream, request)) {
                    // eslint-disable-next-line require-atomic-updates
                    ctx.stop = true
                }
            }

            requestStream.push(null)
        } finally {
            this.ongoingResends.delete(source, ctx)
        }
    }

    private readStreamUntilEndOrError(responseStream: Readable, request: ResendRequest): Promise<boolean> {
        let numOfMessages = 0
        return new Promise((resolve) => {
            // Provide additional safety against hanging promises by emitting
            // error if no data is seen within `maxInactivityPeriodInMs`
            let lastCheck = 0
            const rejectInterval = setInterval(() => {
                if (numOfMessages === lastCheck) {
                    responseStream.emit('error', new Error('_readStreamUntilEndOrError: timeout'))
                }
                lastCheck = numOfMessages
            }, this.maxInactivityPeriodInMs)

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
                    clearInterval(rejectInterval)
                    resolve(false)
                })
                .on('end', () => {
                    clearInterval(rejectInterval)
                    resolve(numOfMessages > 0)
                })
                .on('close', () => {
                    clearInterval(rejectInterval)
                    resolve(numOfMessages > 0)
                })
        })
    }
}
