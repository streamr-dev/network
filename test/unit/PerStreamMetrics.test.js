const { PerStreamMetrics } = require('../../src/logic/PerStreamMetrics')

describe('PerStreamMetrics', () => {
    let perStreamMetrics

    beforeEach(() => {
        perStreamMetrics = new PerStreamMetrics()
    })

    it('empty state', () => {
        expect(perStreamMetrics.report()).toEqual({})
    })

    it('empty state', () => {
        perStreamMetrics.recordPropagateMessage('stream-1')
        perStreamMetrics.recordIgnoredDuplicate('stream-2')
        perStreamMetrics.recordDataReceived('stream-3')
        expect(perStreamMetrics.report()).toEqual({
            'stream-1': {
                onDataReceived: {
                    last: 0,
                    rate: 0,
                    total: 0
                },
                'onDataReceived:ignoredDuplicate': {
                    last: 0,
                    rate: 0,
                    total: 0
                },
                propagateMessage: {
                    last: 1,
                    rate: 1,
                    total: 1
                },
                resends: {
                    last: 0,
                    rate: 0,
                    total: 0
                },
                trackerInstructions: {
                    last: 0,
                    rate: 0,
                    total: 0
                }
            },
            'stream-2': {
                onDataReceived: {
                    last: 0,
                    rate: 0,
                    total: 0
                },
                'onDataReceived:ignoredDuplicate': {
                    last: 1,
                    rate: 1,
                    total: 1
                },
                propagateMessage: {
                    last: 0,
                    rate: 0,
                    total: 0
                },
                resends: {
                    last: 0,
                    rate: 0,
                    total: 0
                },
                trackerInstructions: {
                    last: 0,
                    rate: 0,
                    total: 0
                }
            },
            'stream-3': {
                onDataReceived: {
                    last: 1,
                    rate: 1,
                    total: 1
                },
                'onDataReceived:ignoredDuplicate': {
                    last: 0,
                    rate: 0,
                    total: 0
                },
                propagateMessage: {
                    last: 0,
                    rate: 0,
                    total: 0
                },
                resends: {
                    last: 0,
                    rate: 0,
                    total: 0
                },
                trackerInstructions: {
                    last: 0,
                    rate: 0,
                    total: 0
                }
            }
        })
    })
})
