const murmur = require('murmurhash-native').murmurHash

module.exports = {
    partition(partitionCount, partitionKey) {
        if (!partitionCount) {
            throw new Error('partitionCount is falsey!')
        } else if (partitionCount === 1) {
            // Fast common case
            return 0
        } else if (partitionKey) {
            const bytes = Buffer.from(partitionKey, 'utf8')
            const resultBytes = murmur(bytes, 0, 'buffer')
            const intHash = resultBytes.readInt32LE()
            return Math.abs(intHash) % partitionCount
        } else {
            // Fallback to random partition if no key
            return Math.floor(Math.random() * partitionCount)
        }
    },
}
