const redis = require("redis")
const events = require('events')
const protocol = require('./protocol')
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
		var decoded = protocol.decodeRedis(buffer)
		_this.emit('message', decoded, protocol.get('streamId', decoded))
	});
	this.clientsByHost[host] = client

	// Any existing subscriptions need to be initialized on the new host
	Object.keys(_this.subscriptions).forEach(function(streamId) {
		client.subscribe(streamId)
	})
}

RedisHelper.prototype.removeHost = function(host) {
	this.clientsByHost[host].quit()
}

RedisHelper.prototype.subscribe = function(streamId, cb) {
	var _this = this
	debug("Subscribing ", streamId)
	Object.keys(_this.clientsByHost).forEach(function(host) {
		_this.clientsByHost[host].subscribe(streamId)
	})
	_this.subscriptions[streamId] = true
	if (cb) {
		cb()
	}
}

RedisHelper.prototype.unsubscribe = function(streamId, cb) {
	var _this = this
	debug("Unsubscribing ", streamId)
	Object.keys(_this.clientsByHost).forEach(function(host) {
		_this.clientsByHost[host].unsubscribe(streamId)
	})
	delete _this.subscriptions[streamId]
	if (cb) {
		cb()
	}
}

module.exports = RedisHelper
