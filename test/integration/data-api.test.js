const assert = require('assert')
const fetch = require('node-fetch')
const WebSocket = require('sc-uws')
const createDataApi = require('../../data-api')

const port = 12345

describe('data-api', () => {
    jest.setTimeout(20 * 1000)

    let dataApi

    beforeAll(async (done) => {
        // Start the app
        dataApi = await createDataApi({
            'data-topic': 'data-dev',
            zookeeper: 'localhost',
            redis: 'localhost',
            'redis-pwd': 'not-set',
            cassandra: 'localhost',
            keyspace: 'streamr_dev',
            streamr: 'http://localhost:8081/streamr-core',
            port,
        })

        if (!dataApi.httpServer.listening) {
            dataApi.httpServer.once('listening', done)
        } else {
            done()
        }
    })

    afterAll(() => {
        dataApi.close()
    })

    it('is listening for http requests', () => {
        assert(dataApi.httpServer.listening)
    })

    it('accepts websocket connections', (done) => {
        const ws = new WebSocket(`ws://localhost:${port}/api/v1/ws`)
        ws.on('open', () => {
            ws.close()
            done()
        })
    })

    it('returns 400 response code for invalid websocket requests', (done) => {
        fetch(`http://localhost:${port}/api/v1/ws`, {
            method: 'GET',
            headers: {
                Connection: 'upgrade',
                Upgrade: 'websocket',
                // Missing Sec-Websocket-Key header
            },
        }).then((res) => {
            assert.equal(res.status, 400)
            done()
        }).catch((err) => {
            done(err)
        })
    })
})
