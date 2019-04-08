import sinon from 'sinon'
import StreamrClient from '../../src/StreamrClient'
import Stream from '../../src/rest/domain/Stream'

export default class StubbedStreamrClient extends StreamrClient {
    /* eslint-disable class-methods-use-this */
    getUserInfo() {
        return Promise.resolve({
            username: 'username',
        })
    }
    getStream = sinon.stub().resolves(new Stream(null, {
        id: 'streamId',
        partitions: 1,
    }))
    /* eslint-enable class-methods-use-this */
}
