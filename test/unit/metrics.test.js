const Metrics = require('../../src/metrics')

describe('metrics', () => {
    it('create, inc, decr, get, set', () => {
        const appMetrics = new Metrics('test-app')
        const timestamp = Date.now()

        appMetrics.timestamp = timestamp

        expect(appMetrics.get('metric-a')).toEqual(0)
        expect(appMetrics.get('metric-b')).toEqual(0)

        appMetrics.inc('metric-a')
        appMetrics.inc('metric-a')
        appMetrics.inc('metric-b', 5)

        expect(appMetrics.get('metric-a')).toEqual(2)
        expect(appMetrics.get('metric-b')).toEqual(5)

        appMetrics.decr('metric-a')
        appMetrics.decr('metric-b', 3)

        expect(appMetrics.get('metric-a')).toEqual(1)
        expect(appMetrics.get('metric-b')).toEqual(2)

        appMetrics.decr('metric-a')
        appMetrics.decr('metric-b', 3)

        expect(appMetrics.get('metric-a')).toEqual(0)
        expect(appMetrics.get('metric-b')).toEqual(-1)

        expect(appMetrics.report()).toEqual(
            {
                name: 'test-app',
                // eslint-disable-next-line no-underscore-dangle
                openHandles: process._getActiveRequests().length + process._getActiveHandles().length,
                timestamp,
                metrics: [
                    ['metric-a', 0],
                    ['metric-b', -1]
                ]
            }
        )

        expect(appMetrics.reportAndReset()).toEqual(
            {
                name: 'test-app',
                // eslint-disable-next-line no-underscore-dangle
                openHandles: process._getActiveRequests().length + process._getActiveHandles().length,
                timestamp,
                metrics: [
                    ['metric-a', 0],
                    ['metric-b', -1]
                ]
            }
        )
        // eslint-disable-next-line no-underscore-dangle
        expect(appMetrics._metrics).toEqual(new Map())
        expect(appMetrics.timestamp).toBeGreaterThan(timestamp)

        appMetrics.set('metric-a', 'test-me')
        appMetrics.set('metric-b', 5)
        expect(appMetrics.get('metric-a')).toEqual('test-me')
        expect(appMetrics.get('metric-b')).toEqual(5)
    })

    it('merge', () => {
        const appMetrics1 = new Metrics('test-app1')
        const appMetrics2 = new Metrics('test-app2')
        const timestamp = Date.now()

        appMetrics1.timestamp = timestamp
        appMetrics2.timestamp = timestamp

        appMetrics1.set('metric-a', 'test-me')
        appMetrics1.set('metric-b', 5)

        appMetrics2.set('metric-c', -10)
        appMetrics2.set('metric-d', 50)

        expect(appMetrics2.mergeAndReport(appMetrics1.report())).toEqual(
            [{
                name: 'test-app2',
                // eslint-disable-next-line no-underscore-dangle
                openHandles: process._getActiveRequests().length + process._getActiveHandles().length,
                timestamp,
                metrics:
                    [
                        ['metric-c', -10],
                        ['metric-d', 50]
                    ]
            },
            {
                name: 'test-app1',
                // eslint-disable-next-line no-underscore-dangle
                openHandles: process._getActiveRequests().length + process._getActiveHandles().length,
                timestamp,
                metrics: [
                    ['metric-a', 'test-me'],
                    ['metric-b', 5]
                ]
            }]
        )
    })
})
