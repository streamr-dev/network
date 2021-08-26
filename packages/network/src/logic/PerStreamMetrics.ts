import { Speedometer } from '../helpers/Speedometer'

interface AllMetrics<M> {
    resends: M
    trackerInstructions: M
    onDataReceived: M
    "onDataReceived:ignoredDuplicate": M
    propagateMessage: M
}

interface Metric {
    // eslint-disable-next-line no-underscore-dangle
    _speedometer: Speedometer
    total: number
    last: number
    rate: () => number
}

interface ReportedMetric {
    total: number
    last: number
    rate: number
}

export class PerStreamMetrics {
    private readonly streams: { [key: string]: AllMetrics<Metric> } = {}

    recordResend(streamId: string): void {
        this.setUpIfNeeded(streamId)
        const { resends } = this.streams[streamId]
        this.recordMetric(resends)
    }

    recordTrackerInstruction(streamId: string): void {
        this.setUpIfNeeded(streamId)
        const { trackerInstructions } = this.streams[streamId]
        this.recordMetric(trackerInstructions)
    }

    recordDataReceived(streamId: string): void {
        this.setUpIfNeeded(streamId)
        const { onDataReceived } = this.streams[streamId]
        this.recordMetric(onDataReceived)
    }

    recordIgnoredDuplicate(streamId: string): void {
        this.setUpIfNeeded(streamId)
        const ignoredDuplicate = this.streams[streamId]['onDataReceived:ignoredDuplicate']
        this.recordMetric(ignoredDuplicate)
    }

    recordPropagateMessage(streamId: string): void {
        this.setUpIfNeeded(streamId)
        const { propagateMessage } = this.streams[streamId]
        this.recordMetric(propagateMessage)
    }

    // updates the target metric object
    private recordMetric(metric: Metric) {
        metric.total += 1
        metric.last += 1
        // eslint-disable-next-line no-underscore-dangle
        metric._speedometer.record(1)
    }

    report(): { [key: string]: AllMetrics<ReportedMetric> } {
        const result: { [key: string]: AllMetrics<ReportedMetric> } = {}
        Object.entries(this.streams).forEach(([streamId, metrics]) => {
            result[streamId] = {
                resends: {
                    rate: metrics.resends.rate(),
                    total: metrics.resends.total,
                    last: metrics.resends.last
                },
                trackerInstructions: {
                    rate: metrics.trackerInstructions.rate(),
                    total: metrics.trackerInstructions.total,
                    last: metrics.trackerInstructions.last
                },
                onDataReceived: {
                    rate: metrics.onDataReceived.rate(),
                    total: metrics.onDataReceived.total,
                    last: metrics.onDataReceived.last
                },
                "onDataReceived:ignoredDuplicate": {
                    rate: metrics["onDataReceived:ignoredDuplicate"].rate(),
                    total: metrics["onDataReceived:ignoredDuplicate"].total,
                    last: metrics["onDataReceived:ignoredDuplicate"].last
                },
                propagateMessage: {
                    rate: metrics.propagateMessage.rate(),
                    total: metrics.propagateMessage.total,
                    last: metrics.propagateMessage.last
                }
            }
        })
        return result
    }

    private setUpIfNeeded(streamId: string): void {
        const createMetrics = () => {
            // eslint-disable-next-line no-underscore-dangle
            const _speedometer = new Speedometer()
            return {
                _speedometer,
                rate: () => _speedometer.getRate(),
                last: 0,
                total: 0,
            }
        }
        if (!this.streams[streamId]) {
            this.streams[streamId] = {
                resends: createMetrics(),
                trackerInstructions: createMetrics(),
                onDataReceived: createMetrics(),
                'onDataReceived:ignoredDuplicate': createMetrics(),
                propagateMessage: createMetrics()
            }
        }
    }
}
