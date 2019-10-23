import assert from 'assert'
import sinon from 'sinon'

import Stream from '../../src/rest/domain/Stream'

describe('Stream', () => {

    let stream
    let clientMock

    beforeEach(() => {
        clientMock = {
            publish: sinon.stub(),
        }
        stream = new Stream(clientMock, {
            id: 'stream-id'
        })
    })

    describe('publish()', () => {
        it('should call client.publish(...)', () => {
            const msg = {
                foo: 'bar'
            }
            const ts = Date.now()
            const pk = 'my-partition-key'

            stream.publish(msg, ts, pk)

            sinon.assert.calledWith(clientMock.publish, stream.id, msg, ts, pk)
        })
    })
})
