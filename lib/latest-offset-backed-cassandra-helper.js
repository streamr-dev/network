const debug = require('debug')('LatestOffsetBackedCassandraHelper')
const Promise = require('promise')

function LatestOffsetBackedCassandraHelper(cassandraHelper, latestOffsetFetcher) {
	this.cassandraHelper = cassandraHelper
	this.latestOffsetFetcher = latestOffsetFetcher
}

LatestOffsetBackedCassandraHelper.prototype.getLast = function(stream, streamPartition, count, msgHandler, doneCallback) {
	var _this = this
	this.latestOffsetFetcher.fetchOffset(stream, streamPartition).then(function(latestOffset) {
		_this._tryGetLast(latestOffset, stream, streamPartition, count, msgHandler, doneCallback)
	})
}

LatestOffsetBackedCassandraHelper.prototype._tryGetLast = function(latestOffset, stream, streamPartition, count,
																   msgHandler,
																   doneCallback) {
	var _this = this
	this.cassandraHelper.getLastOffset(stream, streamPartition).then(function(cassandraOffset) {
		if (latestOffset === null || latestOffset <= cassandraOffset) {
			debug("Cassandra is up to date on " + stream + "-" + streamPartition)
			_this.cassandraHelper.getLast(stream, streamPartition, count, msgHandler, doneCallback)
		} else {
			debug("Waiting for Cassandra to catch up on " + stream + "-" + streamPartition + " behind " +
				(latestOffset - cassandraOffset) + " messages  (" + cassandraOffset + "->" + latestOffset + ")")
			setTimeout(_this._tryGetLast.bind(_this, latestOffset, stream, streamPartition, count, msgHandler, doneCallback), 750)
		}
	}).catch(function(err) {
		console.log(err)
	})
}

module.exports = LatestOffsetBackedCassandraHelper