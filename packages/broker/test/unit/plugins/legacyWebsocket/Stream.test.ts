import assert from 'assert'
import { Stream } from '../../../../src/Stream'

describe('Stream', () => {
    it('addConnection adds connections', () => {
        const stream = new Stream<string>('id', 0, 'name')
        stream.addConnection('a')
        stream.addConnection('b')
        stream.addConnection('c')
        assert.deepEqual(stream.getConnections(), ['a', 'b', 'c'])
    })

    describe('removeConnection', () => {
        let stream: Stream<string>

        beforeEach(() => {
            stream = new Stream('id', 0, 'name')
            stream.addConnection('a')
            stream.addConnection('b')
            stream.addConnection('c')
        })

        it('removes connection when connection exists', () => {
            stream.removeConnection('b')
            assert.deepEqual(stream.getConnections(), ['a', 'c'])
        })

        it('does not remove anything if connection does not exist', () => {
            stream.removeConnection('d')
            assert.deepEqual(stream.getConnections(), ['a', 'b', 'c'])
        })
    })
})
