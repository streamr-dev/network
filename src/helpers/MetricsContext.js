const speedometer = require('speedometer')

class Metrics {
    constructor(name) {
        this.name = name
        this.queriedMetrics = {}
        this.recordedMetrics = {}
    }

    addQueriedMetric(name, queryFn) {
        this._verifyUniqueness(name)
        this.queriedMetrics[name] = queryFn
        return this
    }

    addRecordedMetric(name, windowSizeInSeconds = 5) {
        this._verifyUniqueness(name)
        this.recordedMetrics[name] = {
            rate: speedometer(windowSizeInSeconds),
            last: 0,
            total: 0
        }
        return this
    }

    record(name, value) {
        if (!this.recordedMetrics[name]) {
            throw new Error(`Not a recorded metric "${this.name}.${name}".`)
        }
        this.recordedMetrics[name].rate(value)
        this.recordedMetrics[name].total += value
        this.recordedMetrics[name].last += value
        return this
    }

    async report() {
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
        return Object.fromEntries(queryResults.concat(recordedResults))
    }

    clearLast() {
        Object.values(this.recordedMetrics).forEach((record) => {
            // eslint-disable-next-line no-param-reassign
            record.last = 0
        })
    }

    _verifyUniqueness(name) {
        if (this.queriedMetrics[name] || this.recordedMetrics[name]) {
            throw new Error(`Metric "${this.name}.${name}" already registered.`)
        }
    }
}

class MetricsContext {
    constructor(peerId) {
        this.peerId = peerId
        this.startTime = Date.now()
        this.metrics = {}
    }

    create(name) {
        if (this.metrics[name]) {
            throw new Error(`Metrics "${name}" already created.`)
        }
        this.metrics[name] = new Metrics(name)
        return this.metrics[name]
    }

    async report(clearLast = false) {
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
            metrics: Object.fromEntries(entries),
        }
    }
}

module.exports = MetricsContext
