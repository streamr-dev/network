const assert = require('assert')
const StreamStateManager = require('../../../src/websocket/StreamStateManager')

jest.useFakeTimers()

describe('StreamStateManager', () => {
    let streams

    beforeEach(() => {
        streams = new StreamStateManager()
    })

    afterEach(() => {
        streams.close()
    })

    describe('createStreamObject', () => {
        it('returns an object with the correct id, partition and state', () => {
            const stream = streams.createStreamObject('streamId', 3)
            assert.equal(stream.id, 'streamId')
            assert.equal(stream.partition, 3)
            assert.equal(stream.state, 'init')
        })
    })

    describe('getStreamObject', () => {
        let stream
        beforeEach(() => {
            stream = streams.createStreamObject('streamId', 4)
        })

        it('returns the requested stream', () => {
            assert.equal(streams.getStreamObject('streamId', 4), stream)
        })

        it('returns undefined if the stream does not exist', () => {
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

    describe('timeout behavior', () => {
        let stream

        beforeEach(() => {
            stream = streams.createStreamObject('streamId', 0)
        })

        it('stream object is deleted after 60 seconds if state remains unchanged', () => {
            jest.advanceTimersByTime(60 * 1000)
            expect(streams.getStreamObject('streamId', 0)).toBeUndefined()
        })

        it('stream object is deleted after 60 seconds if state is subscribing', () => {
            stream.setSubscribing()
            jest.advanceTimersByTime(60 * 1000)
            expect(streams.getStreamObject('streamId', 0)).toBeUndefined()
        })

        it('stream object remains after 60 seconds if state is subscribed', () => {
            jest.advanceTimersByTime(59 * 1000)
            stream.setSubscribed()
            jest.advanceTimersByTime(1000)
            expect(streams.getStreamObject('streamId', 0)).not.toBeUndefined()
        })
    })
})
