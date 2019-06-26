const speedometer = require('speedometer')

module.exports = class Metrics {
    constructor(name = '') {
        this.name = name || ''
        this.timestamp = Date.now()
        this._metrics = new Map()
    }

    createSpeedometer(name) {
        this._metrics.set(name, speedometer())
    }

    speed(name) {
        return this._metrics.get(name)
    }

    set(name, value) {
        this._metrics.set(name, value)
    }

    inc(name, step = 1) {
        this._put(name, Math.abs(step) || 0)
    }

    decr(name, step = 1) {
        this._put(name, -Math.abs(step) || 0)
    }

    _put(name, step) {
        if (typeof name !== 'string') {
            throw new Error('name is not a string')
        }

        if (!Number.isInteger(step)) {
            throw new Error('step is not an integer')
        }

        this._metrics.set(name, this.get(name) + step)
    }

    get(name) {
        return this._metrics.get(name) || 0
    }

    report() {
        const res = {
            name: this.name,
            timestamp: this.timestamp,
            metrics: Array.from(this._metrics)
        }

        return res
    }

    _reset() {
        this.timestamp = Date.now()
        this._metrics.clear()
    }

    reportAndReset() {
        const res = this.report()
        this._reset()

        return res
    }

    mergeAndReport(report, reset = false) {
        const res = [this.report()]
        res.push(report)

        if (reset) {
            this._reset()
        }

        return res
    }
}
