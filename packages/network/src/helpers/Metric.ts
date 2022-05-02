import EventEmitter from 'eventemitter3'
import { set } from 'lodash'
import { scheduleAtFixedRate } from './scheduler'

export type MetricsDefinition = Record<string,Metric>

interface MetricEvents {
    record: (value: number) => void
}

export abstract class Sampler {

    protected metric: Metric
    private listener: any

    constructor(metric: Metric) {
        this.metric = metric
        this.listener = (value: number) => this.onRecord(value)
    }

    start(_now: number): void {
        this.metric.on('record', this.listener)
    }

    stop(_now: number): void {
        this.metric.off('record', this.listener)
    }

    protected abstract onRecord(value: number): void

    abstract getAggregatedValue(): number | undefined
}

export class Metric {

    private latestValue: number | undefined
    private eventEmitter: EventEmitter<MetricEvents> = new EventEmitter()
    private samplerFactory: (metric: Metric) => Sampler

    constructor(samplerFactory: (metric: Metric) => Sampler, initialValue?: number) {
        this.samplerFactory = samplerFactory
        this.latestValue = initialValue
    }

    record(value: number): void {
        this.latestValue = value
        this.eventEmitter.emit('record', value)
    }

    getLatestValue(): number | undefined {
        return this.latestValue
    }

    on<T extends keyof MetricEvents>(eventName: T, listener: MetricEvents[T]): void {
        this.eventEmitter.on(eventName, listener as any)
    }

    off<T extends keyof MetricEvents>(eventName: T, listener: MetricEvents[T]): void {
        this.eventEmitter.off(eventName, listener as any)
    }

    createSampler(): Sampler {
        return this.samplerFactory(this)
    }
}

/*
 * Sum of all records within a sampling period. 
 *
 * E.g. count of failed connections
 */
class CountSampler extends Sampler {

    protected sum: number = 0

    protected onRecord(value: number): void {
        this.sum += value
    }
    
    getAggregatedValue(): number | undefined {
        return this.sum
    }
}

export class CountMetric extends Metric {
    constructor() {
        super((m) => new CountSampler(m))
    }
}

/*
 * Average of all records within a sampling period. If the sampling data is
 * continuous, you may want to use LevelSampler instead.
 *
 * E.g. average latency
 */
class AverageSampler extends CountSampler {

    private count: number = 0

    protected onRecord(value: number): void {
        super.onRecord(value)
        this.count++
    }

    getAggregatedValue(): number | undefined {
        if (this.count > 0) {
            return this.sum / this.count
        } else {
            return undefined
        }
    }
}

export class AverageMetric extends Metric {
    constructor() {
        super((m) => new AverageSampler(m))
    }
}

/*
 * Average level of the records during a sampling period. Takes the average of the
 * recorded values, but also includes the current level as a first sample when
 * the sampling starts. 
 * 
 * E.g. average count of currently active connections
 */
class LevelSampler extends AverageSampler {
    start(now: number): void {
        super.start(now)
        const latest = this.metric.getLatestValue()
        if (latest !== undefined) {
            this.onRecord(latest)
        }
    }
}

export class LevelMetric extends Metric {
    constructor(initialValue?: number) {
        super((m) => new LevelSampler(m), initialValue)
    }
}

/*
 * Sum of records divided by seconds.
 *
 * E.g. download speed (bytes per second)
 */
class RateSampler extends CountSampler {
    private startTimestamp: number | undefined = undefined
    private stopTimestamp: number | undefined = undefined

    start(now: number): void {
        super.start(now)
        this.startTimestamp = now
    }

    stop(now: number): void {
        super.stop(now)
        this.stopTimestamp = now
    }

    getAggregatedValue(): number | undefined {
        if ((this.startTimestamp !== undefined) && (this.stopTimestamp !== undefined) && (this.startTimestamp !== this.stopTimestamp)) {
            const elapsedSeconds = (this.stopTimestamp - this.startTimestamp) / 1000
            return this.sum / elapsedSeconds
        } else {
            return undefined
        }
    }
}

export class RateMetric extends Metric {
    constructor() {
        super((m) => new RateSampler(m))
    }
}

export type MetricsReport = {
    period: {
        start: number
        end: number
    }
} & Record<string,any>

export class MetricsContext {
    private readonly metrics: Map<string,Metric> = new Map()

    addMetrics(namespace: string, definitions: MetricsDefinition): void {
        Object.keys(definitions).forEach((key) => {
            const id = `${namespace}.${key}`
            if (this.metrics.has(id)) {
                throw new Error(`Metrics "${id}" already created`)
            }
            this.metrics.set(id, definitions[key])
        })
    }

    getMetric(id: string): Metric | undefined {
        return this.metrics.get(id)
    }
    
    createReportProducer(
        onReport: (report: MetricsReport) => unknown, 
        interval: number,
        formatNumber?: (value: number) => string
    ): { stop: () => void } {
        const ongoingSamples: Map<string,Sampler> = new Map()
        return scheduleAtFixedRate(async (now: number) => {
            if (ongoingSamples.size > 0) {
                const report = {
                    period: {
                        start: now - interval,
                        end: now
                    }
                }
                ongoingSamples.forEach((sample, metricId) => {
                    sample.stop(now)
                    const value = sample.getAggregatedValue()
                    if (value !== undefined) {
                        set(report, metricId, (formatNumber !== undefined) ? formatNumber(value) : value)
                    }
                })
                onReport(report)
                ongoingSamples.clear()
            }
            this.metrics.forEach((metric, id) => {
                const sample = metric.createSampler()
                sample.start(now)
                ongoingSamples.set(id, sample)
            })
        }, interval)
    }
}