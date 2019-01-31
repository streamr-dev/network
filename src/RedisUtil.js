const events = require('events')
const redis = require('redis')
const debug = require('debug')('RedisUtil')
const Protocol = require('streamr-client-protocol')

const { MessageLayer } = Protocol

function getRedisKey(streamId, streamPartition) {
    return `${streamId}-${streamPartition}`
}

module.exports = class RedisUtil extends events.EventEmitter {
    constructor(hosts, password, cb) {
        super()

        this.subscriptions = {}
        this.clientsByHost = {}

        debug('Connecting to ', hosts)

        const connectionPromises = hosts.map((host) => this.addHost(host, password))

        Promise.all(connectionPromises)
            .then(() => {
                if (cb) {
                    cb()
                }
            })
    }

    quit() {
        Object.keys(this.clientsByHost)
            .forEach((host) => {
                this.clientsByHost[host].quit()
            })
        this.clientsByHost = []
    }

    subscribe(streamId, streamPartition, cb) {
        const redisKey = getRedisKey(streamId, streamPartition)

        debug('Subscribing to ', redisKey)

        let counter = 0
        const hosts = Object.keys(this.clientsByHost)

        hosts.forEach((host) => {
            this.clientsByHost[host].subscribe(redisKey, () => {
                counter += 1
                if (counter === hosts.length) {
                    this.subscriptions[redisKey] = true
                    if (cb) {
                        cb()
                    }
                }
            })
        })
    }

    unsubscribe(streamId, streamPartition, cb) {
        const redisKey = getRedisKey(streamId, streamPartition)

        debug('Unsubscribing ', redisKey)
        Object.keys(this.clientsByHost)
            .forEach((host) => {
                this.clientsByHost[host].unsubscribe(redisKey)
            })
        delete this.subscriptions[redisKey]
        if (cb) {
            cb()
        }
    }

    addHost(host, password) {
        return new Promise(((resolve, reject) => {
            const client = redis.createClient({
                host,
                password,
                return_buffers: true,
            })
                .on('ready', () => {
                    debug('connected to ', host)
                    this.clientsByHost[host] = client
                    resolve()
                })
                .on('error', (err) => {
                    console.log(`Redis error connecting to host ${host}: ${err}`)
                    reject()
                })
                .on('message', (channel, buffer) => {
                    const streamMessage = MessageLayer.StreamMessageFactory.deserialize(buffer.toString())
                    this.emit('message', streamMessage)
                })
        }))
    }
}
