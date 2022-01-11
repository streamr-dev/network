import { MetricsContext } from 'streamr-network'
import { scheduleAtFixedRate } from '../../../helpers/scheduler'
import { MetricsPublisher } from './MetricsPublisher'
import { PERIOD_LENGTHS, Sample } from './Sample'
import { SampleFactory } from './Sample'

type AggregatorListener = (data: Sample) => Promise<void>

/** 
 * Aggregator of timebased samples. Periods are fixed-length UTC periods 
 * (e.g. 24 * 60 * 60 * 1000 is a UTC day from 00:00 (inclusive) to 00:00 next day (exclusive))
 */
export class Aggregator {

    periodLength: number
    sampleFactory: SampleFactory
    listener: AggregatorListener
    samples: Sample[] = []
    startTimestamp?: number

    constructor(periodLength: number, sampleFactory: SampleFactory, listener: AggregatorListener) {
        this.periodLength = periodLength
        this.sampleFactory = sampleFactory
        this.listener = listener
    }

    async addSample(sample: Sample): Promise<void> {
        this.samples.push(sample)
        const sampleStart = sample.period.start
        if (this.startTimestamp === undefined) {
            const elapsedTime = (sampleStart % this.periodLength)
            this.startTimestamp = sampleStart - elapsedTime
        }
    }

    async addSamples(samples: Sample[]): Promise<void> {
        for await (const sample of samples) {
            await this.addSample(sample)
        }
    }

    async onTick(now: number): Promise<void> {
        if ((this.startTimestamp !== undefined) && (now >= this.startTimestamp + this.periodLength)) {
            const aggregated = await this.sampleFactory.createAggregated(this.samples, {
                start: this.startTimestamp,
                end: this.startTimestamp + this.periodLength
            })
            await this.listener(aggregated)
            this.samples = []
            this.startTimestamp = undefined
        }
    }
}

export class NodeMetrics {

    publisher: MetricsPublisher
    scheduler?: { stop: () => void }
    sampleFactory: SampleFactory
    dayAggregator: Aggregator
    hourAggregator: Aggregator
    minuteAggregator: Aggregator

    constructor(metricsContext: MetricsContext, publisher: MetricsPublisher) {
        this.publisher = publisher
        const createListener = (propagationTarget?: Aggregator) => {
            return async (sample: Sample) => {
                if (propagationTarget !== undefined) {
                    await propagationTarget.addSample(sample)
                }
                this.publisher.publish(sample)
            }
        }
        this.sampleFactory = new SampleFactory(metricsContext)
        this.dayAggregator = new Aggregator(PERIOD_LENGTHS.ONE_DAY, this.sampleFactory, createListener())
        this.hourAggregator = new Aggregator(PERIOD_LENGTHS.ONE_HOUR, this.sampleFactory, createListener(this.dayAggregator))
        this.minuteAggregator = new Aggregator(PERIOD_LENGTHS.ONE_MINUTE, this.sampleFactory, createListener(this.hourAggregator))
    }

    async start(): Promise<void> {
        const existingSamples = await this.publisher.fetchExistingSamples()
        this.hourAggregator.addSamples(existingSamples.minutes)
        this.dayAggregator.addSamples(existingSamples.hours)
        this.scheduler = scheduleAtFixedRate(async (now) => {
            await this.collectSample(now)
        }, PERIOD_LENGTHS.FIVE_SECONDS)
    }

    async collectSample(now: number): Promise<void> {
        const sample = await this.sampleFactory.createPrimary({
            start: now - PERIOD_LENGTHS.FIVE_SECONDS,
            end: now
        })
        await this.publisher.publish(sample)
        await this.minuteAggregator.addSample(sample)
        for await (const aggregator of [this.minuteAggregator, this.hourAggregator, this.dayAggregator]) {
            await aggregator.onTick(sample.period.end)
        }
    }

    async stop(): Promise<void> {
        this.scheduler?.stop()
        await this.publisher.stop()
    }
}