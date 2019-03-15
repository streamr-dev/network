import StreamrClient from '../../src/StreamrClient'

export default class StubbedStreamrClient extends StreamrClient {
    /* eslint-disable class-methods-use-this */
    getUserInfo() {
        return Promise.resolve({
            username: 'username',
        })
    }
    getStream() {
        return Promise.resolve({
            id: 'streamId',
            partitions: 1,
        })
    }
    /* eslint-enable class-methods-use-this */
}
