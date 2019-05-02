const assert = require('assert')
const fetch = require('node-fetch')
const WebSocket = require('ws')
const createBroker = require('../../broker')

const httpPort = 12345
const wsPort = 12346

describe('data-api', () => {
    let dataApi

    beforeAll(async () => {
        // Start the app
        dataApi = await createBroker({
            cassandra: 'localhost',
            keyspace: 'streamr_dev',
            networkHostname: '127.0.0.1',
            networkPort: 31313,
            streamr: 'http://localhost:8081/streamr-core',
            httpPort,
            wsPort,
        })
    })

    afterAll(() => {
        dataApi.close()
    })

    it('accepts websocket connections', (done) => {
        const ws = new WebSocket(`ws://localhost:${wsPort}/api/v1/ws`)
        ws.on('open', () => {
            ws.close()
            done()
        })
    })

    it('returns 400 response code for invalid websocket requests', (done) => {
        fetch(`http://localhost:${wsPort}/api/v1/ws`, {
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
}, 20 * 1000)
