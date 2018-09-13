const assert = require('assert')
const encoder = require('../../src/helpers/MessageEncoder')
const Connection = require('../../src/connection/Connection')
const { version } = require('../../package.json')

describe('encoder', () => {
    it('check all codes', (done) => {
        assert.equal(encoder.STATUS, 0)
        assert.equal(encoder.PEERS, 1)
        assert.equal(encoder.SUBSCRIBE, 3)
        assert.equal(encoder.PUBLISH, 4)
        assert.equal(encoder.STREAM, 5)

        done()
    })

    it('check all code messages', (done) => {
        assert.equal(encoder.getMsgPrefix(encoder.STATUS), 'STATUS')
        assert.equal(encoder.getMsgPrefix(encoder.PEERS), 'PEERS')
        assert.equal(encoder.getMsgPrefix(encoder.SUBSCRIBE), 'SUBSCRIBE')
        assert.equal(encoder.getMsgPrefix(encoder.PUBLISH), 'PUBLISH')
        assert.equal(encoder.getMsgPrefix(encoder.STREAM), 'STREAM')

        done()
    })

    it('check streamMessage encoding/decoding', (done) => {
        const json = encoder.streamMessage('stream-id', 'node-address')
        assert.equal(json, `{"version":"${version}","code":5,"data":["stream-id","node-address"]}`)

        const result = encoder.decode(json)
        assert.deepEqual(result, {
            version,
            code: 5,
            data: ['stream-id', 'node-address']
        })

        done()
    })
})

