const debug = require('debug')('LatestOffsetBackedCassandraHelper')
const Promise = require('promise')

function LatestOffsetBackedCassandraHelper(cassandraHelper, latestOffsetFetcher) {
	this.cassandraHelper = cassandraHelper
	this.latestOffsetFetcher = latestOffsetFetcher
}

LatestOffsetBackedCassandraHelper.prototype.getLast = function(stream, streamPartition, count, msgHandler, doneCallback) {
	var latestFetch = this.latestOffsetFetcher.fetchOffset(stream, streamPartition)
	var cassandraFetch = this.cassandraHelper.getLastOffset(stream, streamPartition)

	var _this = this
	Promise.all([latestFetch, cassandraFetch]).then(function(res) {
		var latestOffset = res[0]
		var cassandraOffset = res[1]
		if (latestOffset === null || latestOffset <= cassandraOffset) {
			debug("Cassandra is up to date on " + stream + "-" + streamPartition)
			_this.cassandraHelper.getLast(stream, streamPartition, count, msgHandler, doneCallback)
		} else {
			debug("Waiting for Cassandra to catch up on " + stream + "-" + streamPartition + " behind " +
				(latestOffset - cassandraOffset) + " messages  (" + cassandraOffset + "->" + latestOffset + ")")
			setTimeout(_this.getLast.bind(_this, stream, streamPartition, count, msgHandler, doneCallback), 1000)
		}
	}).catch(function(err) {
		console.log(err)
	})
}

module.exports = LatestOffsetBackedCassandraHelper