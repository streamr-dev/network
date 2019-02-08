const BufferReader = require('buffer-reader')
const StreamrBinaryMessage = require('./StreamrBinaryMessage')
const StreamrBinaryMessageV28 = require('./StreamrBinaryMessageV28')
const StreamrBinaryMessageV29 = require('./StreamrBinaryMessageV29')

module.exports = {
    fromBytes: (buf) => {
        const reader = buf instanceof BufferReader ? buf : new BufferReader(buf)
        const version = reader.nextInt8()
        if (version === StreamrBinaryMessage.VERSION) {
            return StreamrBinaryMessageV28.fromBytes(reader)
        } else if (version === StreamrBinaryMessage.VERSION_SIGNED) {
            return StreamrBinaryMessageV29.fromBytes(reader)
        }
        throw new Error(`Unknown version: ${version}`)
    },
}
