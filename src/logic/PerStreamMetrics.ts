import speedometer from "speedometer"

interface AllMetrics<M> {
    resends: M
    trackerInstructions: M
    onDataReceived: M
    "onDataReceived:ignoredDuplicate": M
    propagateMessage: M
}

interface Metric {
    total: number
    last: number
    rate: (delta?: number) => number
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
        resends.total += 1
        resends.last += 1
        resends.rate(1)
    }

    recordTrackerInstruction(streamId: string): void {
        this.setUpIfNeeded(streamId)
        const { trackerInstructions } = this.streams[streamId]
        trackerInstructions.total += 1
        trackerInstructions.last += 1
        trackerInstructions.rate(1)
    }

    recordDataReceived(streamId: string): void {
        this.setUpIfNeeded(streamId)
        const { onDataReceived } = this.streams[streamId]
        onDataReceived.total += 1
        onDataReceived.last += 1
        onDataReceived.rate(1)
    }

    recordIgnoredDuplicate(streamId: string): void {
        this.setUpIfNeeded(streamId)
        const ignoredDuplicate = this.streams[streamId]['onDataReceived:ignoredDuplicate']
        ignoredDuplicate.total += 1
        ignoredDuplicate.last += 1
        ignoredDuplicate.rate(1)
    }

    recordPropagateMessage(streamId: string): void {
        this.setUpIfNeeded(streamId)
        const { propagateMessage } = this.streams[streamId]
        propagateMessage.total += 1
        propagateMessage.last += 1
        propagateMessage.rate(1)
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
        if (!this.streams[streamId]) {
            this.streams[streamId] = {
                resends: {
                    rate: speedometer(),
                    last: 0,
                    total: 0,
                },
                trackerInstructions: {
                    rate: speedometer(),
                    last: 0,
                    total: 0
                },
                onDataReceived: {
                    rate: speedometer(),
                    last: 0,
                    total: 0
                },
                'onDataReceived:ignoredDuplicate': {
                    rate: speedometer(),
                    last: 0,
                    total: 0
                },
                propagateMessage: {
                    rate: speedometer(),
                    last: 0,
                    total: 0
                }
            }
        }
    }
}
