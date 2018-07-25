const redis = require('redis')

function getRedisKey(streamId, streamPartition) {
    return `${streamId}-${streamPartition}`
}

module.exports = class RedisOffsetFetcher {
    constructor(host, password) {
        this.client = redis.createClient({
            host,
            password,
            return_buffers: true,
        })
    }

    fetchOffset(streamId, streamPartition) {
        return new Promise(((resolve, reject) => {
            const redisKey = getRedisKey(streamId, streamPartition)

            this.client.get(redisKey, (error, reply) => {
                if (error) {
                    reject(error)
                } else {
                    resolve(reply == null ? null : parseInt(reply))
                }
            })
        }))
    }
}
