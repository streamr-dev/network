const speedometer = require('speedometer')

module.exports = class PerStreamMetrics {
    constructor() {
        this.streams = {}
    }

    recordResend(streamId) {
        this._setUpIfNeeded(streamId)
        const { resends } = this.streams[streamId]
        resends.total += 1
        resends.last += 1
        resends.rate(1)
    }

    recordTrackerInstruction(streamId) {
        this._setUpIfNeeded(streamId)
        const { trackerInstructions } = this.streams[streamId]
        trackerInstructions.total += 1
        trackerInstructions.last += 1
        trackerInstructions.rate(1)
    }

    recordDataReceived(streamId) {
        this._setUpIfNeeded(streamId)
        const { onDataReceived } = this.streams[streamId]
        onDataReceived.total += 1
        onDataReceived.last += 1
        onDataReceived.rate(1)
    }

    recordIgnoredDuplicate(streamId) {
        this._setUpIfNeeded(streamId)
        const ignoredDuplicate = this.streams[streamId]['onDataReceived:ignoredDuplicate']
        ignoredDuplicate.total += 1
        ignoredDuplicate.last += 1
        ignoredDuplicate.rate(1)
    }

    recordPropagateMessage(streamId) {
        this._setUpIfNeeded(streamId)
        const { propagateMessage } = this.streams[streamId]
        propagateMessage.total += 1
        propagateMessage.last += 1
        propagateMessage.rate(1)
    }

    recordSubscribeRequest(streamId) {
        this._setUpIfNeeded(streamId)
        const { onSubscribeRequest } = this.streams[streamId]
        onSubscribeRequest.total += 1
        onSubscribeRequest.last += 1
        onSubscribeRequest.rate(1)
    }

    recordUnsubscribeRequest(streamId) {
        this._setUpIfNeeded(streamId)
        const { onUnsubscribeRequest } = this.streams[streamId]
        onUnsubscribeRequest.total += 1
        onUnsubscribeRequest.last += 1
        onUnsubscribeRequest.rate(1)
    }

    report() {
        const result = {}
        Object.entries(this.streams).forEach(([streamId, metrics]) => {
            const innerResult = {}
            Object.entries(metrics).forEach(([key, { rate, last, total }]) => {
                innerResult[key] = {
                    rate: rate(),
                    last,
                    total
                }
            })
            result[streamId] = innerResult
        })
        return result
    }

    _setUpIfNeeded(streamId) {
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
                },
                onSubscribeRequest: {
                    rate: speedometer(),
                    last: 0,
                    total: 0
                },
                onUnsubscribeRequest: {
                    rate: speedometer(),
                    last: 0,
                    total: 0
                }
            }
        }
    }
}
