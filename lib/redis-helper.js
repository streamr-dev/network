const redis = require("redis")
const events = require('events')
const StreamrBinaryMessageWithKafkaMetadata = require('./protocol/StreamrBinaryMessageWithKafkaMetadata')
const debug = require('debug')('RedisHelper')

function RedisHelper(hosts, password, cb) {
	const _this = this
	this.subscriptions = {}
	this.clientsByHost = {}

	debug("Connecting to ", hosts)

	const connectionPromises = hosts.map(function(host) {
		return addHost(_this, host, password)
	})

	Promise.all(connectionPromises).then(function() {
		if (cb) {
			cb()
		}
	})
}

RedisHelper.prototype.__proto__ = events.EventEmitter.prototype;

RedisHelper.prototype.quit = function() {
	const _this = this
	Object.keys(this.clientsByHost).forEach(function(host) {
		_this.clientsByHost[host].quit()
	})
	this.clientsByHost = []
}

RedisHelper.prototype.subscribe = function(streamId, streamPartition, cb) {
	const _this = this
	const redisKey = getRedisKey(streamId, streamPartition)

	debug("Subscribing to ", redisKey)

	var counter = 0
	const hosts = Object.keys(_this.clientsByHost)

	hosts.forEach(function(host) {
		_this.clientsByHost[host].subscribe(redisKey, function () {
			counter += 1
			if (counter === hosts.length) {
				_this.subscriptions[redisKey] = true
				if (cb) {
					cb()
				}
			}
		})
	})
}

RedisHelper.prototype.unsubscribe = function(streamId, streamPartition, cb) {
	const _this = this
	const redisKey = getRedisKey(streamId, streamPartition)

	debug("Unsubscribing ", redisKey)
	Object.keys(_this.clientsByHost).forEach(function(host) {
		_this.clientsByHost[host].unsubscribe(redisKey)
	})
	delete _this.subscriptions[redisKey]
	if (cb) {
		cb()
	}
}

function addHost(_this, host, password) {
	return new Promise(function(resolve, reject) {
		var client = redis.createClient({
			host: host,
			password: password,
			return_buffers: true
		}).on("ready", function () {
			debug("connected to ", host)
			_this.clientsByHost[host] = client
			resolve()
		}).on("error", function (err) {
			console.log("Redis error connecting to host " + host + ": " + err);
			reject()
		}).on('message', function (channel, buffer) {
			var streamrBinaryMessageWithKafkaMetadata = StreamrBinaryMessageWithKafkaMetadata.fromBytes(buffer, true)
			var streamrBinaryMessage = streamrBinaryMessageWithKafkaMetadata.getStreamrBinaryMessage(true)

			_this.emit('message',
				streamrBinaryMessageWithKafkaMetadata.toArray(), // convert to array for efficient emission to client
				streamrBinaryMessage.streamId,
				streamrBinaryMessage.streamPartition
			)
		})
	})
}

function getRedisKey(streamId, streamPartition) {
	return streamId + '-' + streamPartition
}

module.exports = RedisHelper
