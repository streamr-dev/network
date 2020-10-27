import sinon from 'sinon'

import StreamrClient from '../../src/'
import Stream from '../../src/rest/domain/Stream'

export default class StubbedStreamrClient extends StreamrClient {
    getUserInfo() {
        return Promise.resolve({
            username: 'username',
        })
    }

    async getStream () {
        return new Stream(null, {
            id: 'streamId',
            partitions: 1,
        })
    }
}
// publisherId is the hash of 'username'
StubbedStreamrClient.hashedUsername = '0x16F78A7D6317F102BBD95FC9A4F3FF2E3249287690B8BDAD6B7810F82B34ACE3'.toLowerCase()
