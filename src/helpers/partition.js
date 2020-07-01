const crypto = require('crypto')

module.exports = function partition(partitionCount, partitionKey) {
    if (!partitionCount) {
        throw new Error('partitionCount is falsey!')
    } else if (partitionCount === 1) {
        // Fast common case
        return 0
    } else if (partitionKey) {
        const buffer = crypto.createHash('md5').update(partitionKey).digest()
        const intHash = buffer.readInt32LE()
        return Math.abs(intHash) % partitionCount
    } else {
        // Fallback to random partition if no key
        return Math.floor(Math.random() * partitionCount)
    }
}
