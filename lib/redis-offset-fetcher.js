'use strict'

const redis = require("redis")
const Promise = require('promise')

function RedisOffsetFetcher(host, password) {
	this.client = redis.createClient({
		host: host,
		password: password,
		return_buffers: true
	})
}

function getRedisKey(streamId, streamPartition) {
	return streamId + '-' + streamPartition
}

RedisOffsetFetcher.prototype.fetchOffset = function(streamId, streamPartition) {
	var client = this.client
	return new Promise(function(resolve, reject) {
		var redisKey = getRedisKey(streamId, streamPartition)

		client.get(redisKey, function (error, reply) {
			if (error) {
				reject(error)
			} else {
				resolve(reply == null ? null : parseInt(reply))
			}
		})
	})
}

module.exports = RedisOffsetFetcher
