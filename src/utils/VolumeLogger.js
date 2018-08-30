module.exports = class VolumeLogger {
    constructor(reportingIntervalSeconds = 60) {
        this.reportingIntervalSeconds = reportingIntervalSeconds
        this.connectionCount = 0
        this.inCount = 0
        this.outCount = 0

        if (this.reportingIntervalSeconds > 0) {
            setInterval(() => {
                this.log()
            }, this.reportingIntervalSeconds * 1000)
        }
    }

    log() {
        const inPerSecond = this.inCount / this.reportingIntervalSeconds
        const outPerSecond = this.outCount / this.reportingIntervalSeconds

        console.log(
            'Connections: %d, Messages in/sec: %d, Messages out/sec: %d',
            this.connectionCount,
            inPerSecond < 10 ? inPerSecond.toFixed(1) : Math.round(inPerSecond),
            outPerSecond < 10 ? outPerSecond.toFixed(1) : Math.round(outPerSecond),
        )

        this.inCount = 0
        this.outCount = 0
    }
}
