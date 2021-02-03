const { startTracker } = require('streamr-network')

const { startBroker, createClient } = require('../utils')

const httpPort1 = 12741
const wsPort1 = 12751
const networkPort1 = 12365
const trackerPort = 12970
const broker1Key = '0x241b3f241b110ff7b3e6d52e74fea922006a83e33ff938e6e3cba8a460c02513'

describe('metricsStream', () => {
    let tracker
    let broker1
    let client1

    beforeEach(async () => {
        tracker = await startTracker({
            host: '127.0.0.1',
            port: trackerPort,
            id: 'tracker'
        })

        broker1 = await startBroker({
            name: 'broker1',
            privateKey: broker1Key,
            networkPort: networkPort1,
            trackerPort,
            httpPort: httpPort1,
            wsPort: wsPort1,
            reporting: {
                sentry: null,
                streamr: null,
                intervalInSeconds: 10,
                perNodeMetrics: {
                    enabled: true,
                    wsUrl: 'ws://127.0.0.1:' + wsPort1 + '/api/v1/ws',
                    httpUrl: 'http://localhost/api/v1'
                }
            }
        })

        client1 = createClient(wsPort1)
    })

    afterEach(async () => {
        await Promise.allSettled([
            tracker.stop(),
            broker1.close(),
            client1.ensureDisconnected()
        ])
    })

    it('should test the new metrics endpoint', (done) => {
        client1.subscribe({
            stream: '0xC59b3658D22e0716726819a56e164ee6825e21C2/streamr/node/metrics/sec',
        }, (res) => {
            expect(res.peerId).toEqual('broker1')
            done()
        })
    }, 15 * 1000)
})
