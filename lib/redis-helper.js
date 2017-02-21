const redis = require("redis")
const events = require('events')
const StreamrBinaryMessageWithKafkaMetadata = require('./protocol/StreamrBinaryMessageWithKafkaMetadata')
const debug = require('debug')('RedisHelper')

// TODO: tests
function RedisHelper(hosts, password) {
	var _this = this
	this.password = password
	this.subscriptions = {}
	this.clientsByHost = {}

	debug("Connecting to ", hosts)
	hosts.forEach(function(host) {
		_this.addHost(host)
	})
}

function getRedisKey(streamId, streamPartition) {
	return streamId + '-' + streamPartition
}

RedisHelper.prototype.__proto__ = events.EventEmitter.prototype;

RedisHelper.prototype.addHost = function(host) {
	var _this = this
	var client = redis.createClient({
		host: host,
		password: this.password,
		return_buffers: true
	})
	client.on("error", function (err) {
		console.log("Redis error connecting to host " + host + ": " + err);
	});
	client.on("ready", function () {
		debug("Redis client connected to ", host)
	});
	client.on('message', function (channel, buffer) {
		var streamrBinaryMessageWithKafkaMetadata = StreamrBinaryMessageWithKafkaMetadata.fromBytes(buffer)
		var streamrBinaryMessage = streamrBinaryMessageWithKafkaMetadata.getStreamrBinaryMessage()
		// Convert to array for efficient emission to client
		_this.emit('message', streamrBinaryMessageWithKafkaMetadata.toArray(), streamrBinaryMessage.streamId, streamrBinaryMessage.streamPartition)
	});
	this.clientsByHost[host] = client

	// Any existing subscriptions need to be initialized on the new host
	Object.keys(_this.subscriptions).forEach(function(streamId) {
		client.subscribe(streamId)
	})
}

RedisHelper.prototype.fetchOffset = function(streamId, streamPartition, cb) {
	var client = this.clientsByHost[Object.keys(this.clientsByHost)[0]]
	var redisKey = getRedisKey(streamId, streamPartition)

	client.get(redisKey, function(error, reply) {
		if (error) {
			console.error("Failed to fetch for", streamId, "because of", error)
		} else {
			cb(reply == null ? null : parseInt(reply))
		}
	})
}

RedisHelper.prototype.removeHost = function(host) {
	this.clientsByHost[host].quit()
}

RedisHelper.prototype.subscribe = function(streamId, streamPartition, cb) {
	var _this = this
	var redisKey = getRedisKey(streamId, streamPartition)
	debug("Subscribing ", redisKey)
	Object.keys(_this.clientsByHost).forEach(function(host) {
		_this.clientsByHost[host].subscribe(redisKey)
	})
	_this.subscriptions[streamId] = true
	if (cb) {
		cb()
	}
}

RedisHelper.prototype.unsubscribe = function(streamId, streamPartition, cb) {
	var _this = this
	var redisKey = getRedisKey(streamId, streamPartition)
	debug("Unsubscribing ", redisKey)
	Object.keys(_this.clientsByHost).forEach(function(host) {
		_this.clientsByHost[host].unsubscribe(redisKey)
	})
	delete _this.subscriptions[streamId]
	if (cb) {
		cb()
	}
}

module.exports = RedisHelper
