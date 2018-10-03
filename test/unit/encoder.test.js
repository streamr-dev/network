const encoder = require('../../src/helpers/MessageEncoder')
const { version } = require('../../package.json')

describe('encoder', () => {
    it('check all codes', (done) => {
        expect(encoder.STATUS).toEqual(0)
        expect(encoder.PEERS).toEqual(1)
        expect(encoder.DATA).toEqual(2)
        expect(encoder.SUBSCRIBE).toEqual(3)
        expect(encoder.UNSUBSCRIBE).toEqual(4)
        expect(encoder.PUBLISH).toEqual(5)
        expect(encoder.STREAM).toEqual(6)

        done()
    })

    it('check all code messages', (done) => {
        expect(encoder.getMsgPrefix(encoder.STATUS)).toEqual('STATUS')
        expect(encoder.getMsgPrefix(encoder.PEERS)).toEqual('PEERS')
        expect(encoder.getMsgPrefix(encoder.SUBSCRIBE)).toEqual('SUBSCRIBE')
        expect(encoder.getMsgPrefix(encoder.PUBLISH)).toEqual('PUBLISH')
        expect(encoder.getMsgPrefix(encoder.STREAM)).toEqual('STREAM')

        done()
    })

    it('check streamMessage encoding/decoding', (done) => {
        const json = encoder.streamMessage('stream-id', 'node-address')
        expect(json).toEqual(`{"version":"${version}","code":${encoder.STREAM},"payload":{"streamId":"stream-id","nodeAddress":"node-address"}}`)

        const source = null
        const streamMessage = encoder.decode(source, json)
        expect(streamMessage.toJSON()).toEqual({
            version,
            code: encoder.STREAM,
            source,
            streamId: 'stream-id',
            nodeAddress: 'node-address'
        })

        expect(streamMessage.constructor.name).toEqual('StreamMessage')
        expect(streamMessage.getStreamId()).toEqual('stream-id')
        expect(streamMessage.getNodeAddress()).toEqual('node-address')

        done()
    })

    it('creates expected dataMessage format (without numbers)', () => {
        const actual = encoder.dataMessage('stream-id', {
            hello: 'world'
        })
        expect(JSON.parse(actual)).toEqual({
            code: encoder.DATA,
            version,
            payload: {
                streamId: 'stream-id',
                data: {
                    hello: 'world',
                },
                number: null,
                previousNumber: null
            }
        })
    })

    it('creates expected dataMessage format (with number)', () => {
        const actual = encoder.dataMessage('stream-id', {
            hello: 'world'
        }, 958004, 958000)
        expect(JSON.parse(actual)).toEqual({
            code: encoder.DATA,
            version,
            payload: {
                streamId: 'stream-id',
                data: {
                    hello: 'world',
                },
                number: 958004,
                previousNumber: 958000
            }
        })
    })
})

