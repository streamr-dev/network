const assert = require('assert')
const StreamStateManager = require('../../src/StreamStateManager')

describe('StreamStateManager', () => {
    let streams

    beforeEach(() => {
        streams = new StreamStateManager()
    })

    describe('createStreamObject', () => {
        it('should return an object with the correct id, partition and state', () => {
            const stream = streams.createStreamObject('streamId', 3)
            assert.equal(stream.id, 'streamId')
            assert.equal(stream.partition, 3)
            assert.equal(stream.state, 'init')
        })

        it('should return an object that can be looked up', () => {
            const stream = streams.createStreamObject('streamId', 4)
            assert.equal(streams.getStreamObject('streamId', 4), stream)
        })
    })

    describe('getStreamObject', () => {
        let stream
        beforeEach(() => {
            stream = streams.createStreamObject('streamId', 0)
        })

        it('must return the requested stream', () => {
            assert.equal(streams.getStreamObject('streamId', 0), stream)
        })

        it('must return undefined if the stream does not exist', () => {
            assert.equal(streams.getStreamObject('streamId', 1), undefined)
        })
    })

    describe('deleteStreamObject', () => {
        beforeEach(() => {
            streams.createStreamObject('streamId', 0)
        })

        it('must delete the requested stream', () => {
            streams.deleteStreamObject('streamId', 0)
            assert.equal(streams.getStreamObject('streamId', 0), undefined)
        })
    })
})
