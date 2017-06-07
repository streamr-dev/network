var murmur = require('murmurhash-native').murmurHash

module.exports = {
    partition: function (partitionCount, partitionKey) {
        if (!partitionCount) {
          throw "partitionCount is falsey!"
        } else if (partitionCount === 1) {
            // Fast common case
            return 0
        } else if (partitionKey) {
            var bytes = new Buffer(partitionKey, 'utf8')
            var resultBytes = murmur(bytes, 0, 'buffer')
            var intHash = resultBytes.readInt32LE()
            return Math.abs(intHash) % partitionCount
        } else {
            // Fallback to random partition if no key
            return Math.floor(Math.random() * partitionCount)
        }
    }
}