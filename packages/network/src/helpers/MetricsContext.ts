import speedometer from 'speedometer'

type QueryFn = () => (Promise<number> | number | Promise<Record<string, unknown>> | Record<string, unknown>)

interface IndividualReport {
    [key: string]: number | Record<string, unknown> | {
        rate: number
        total: number
        last: number
    }
}

interface Report {
    peerId: string
    startTime: number
    currentTime: number
    metrics: {
        [key: string]: IndividualReport
    }
}

export class Metrics {
    private readonly name: string
    private readonly queriedMetrics: {
        [key: string]: QueryFn
    }
    private readonly recordedMetrics: {
        [key: string]: {
            rate: (delta?: number) => number,
            last: number,
            total: number
        }
    }
    private readonly fixedMetrics: {
        [key: string]: number
    }

    constructor(name: string) {
        this.name = name
        this.queriedMetrics = {}
        this.recordedMetrics = {}
        this.fixedMetrics = {}
    }

    addQueriedMetric(name: string, queryFn: QueryFn): Metrics {
        this.verifyUniqueness(name)
        this.queriedMetrics[name] = queryFn
        return this
    }

    addRecordedMetric(name: string, windowSizeInSeconds = 5): Metrics {
        this.verifyUniqueness(name)
        this.recordedMetrics[name] = {
            rate: speedometer(windowSizeInSeconds),
            last: 0,
            total: 0
        }
        return this
    }

    addFixedMetric(name: string, initialValue = 0): Metrics {
        this.verifyUniqueness(name)
        this.fixedMetrics[name] = initialValue
        return this
    }

    record(name: string, value: number): Metrics {
        if (!this.recordedMetrics[name]) {
            throw new Error(`Not a recorded metric "${this.name}.${name}".`)
        }
        this.recordedMetrics[name].rate(value)
        this.recordedMetrics[name].total += value
        this.recordedMetrics[name].last += value
        return this
    }

    set(name: string, value: number): Metrics {
        if (this.fixedMetrics[name] === undefined) {
            throw new Error(`Not a fixed metric "${this.name}.${name}".`)
        }
        this.fixedMetrics[name] = value
        return this
    }

    async report(): Promise<IndividualReport> {
        const queryResults = await Promise.all(
            Object.entries(this.queriedMetrics)
                .map(async ([name, queryFn]) => [name, await queryFn()])
        )
        const recordedResults = Object.entries(this.recordedMetrics)
            .map(([name, { rate, total, last }]) => [name, {
                rate: rate(),
                total,
                last
            }])
        const fixedResults = Object.entries(this.fixedMetrics)
        return Object.fromEntries([...queryResults, ...recordedResults, ...fixedResults])
    }

    clearLast(): void {
        Object.values(this.recordedMetrics).forEach((record) => {
            // eslint-disable-next-line no-param-reassign
            record.last = 0
        })
    }

    private verifyUniqueness(name: string): void | never {
        if (this.queriedMetrics[name] || this.recordedMetrics[name]) {
            throw new Error(`Metric "${this.name}.${name}" already registered.`)
        }
    }
}

export class MetricsContext {
    private readonly peerId: string
    private readonly startTime: number
    private readonly metrics: {
        [key: string]: Metrics
    }

    constructor(peerId: string) {
        this.peerId = peerId
        this.startTime = Date.now()
        this.metrics = {}
    }

    create(name: string): Metrics {
        if (this.metrics[name]) {
            throw new Error(`Metrics "${name}" already created.`)
        }
        this.metrics[name] = new Metrics(name)
        return this.metrics[name]
    }

    async report(clearLast = false): Promise<Report> {
        const entries = await Promise.all(
            Object.entries(this.metrics)
                .map(async ([name, metrics]) => [name, await metrics.report()])
        )
        if (clearLast) {
            Object.values(this.metrics).forEach((metrics) => metrics.clearLast())
        }
        return {
            peerId: this.peerId,
            startTime: this.startTime,
            currentTime: Date.now(),
            metrics: Object.fromEntries(entries),
        }
    }
}
