const BufferReader = require('buffer-reader')
const StreamrBinaryMessageV28 = require('./StreamrBinaryMessageV28')
const StreamrBinaryMessageV29 = require('./StreamrBinaryMessageV29')
const StreamrBinaryMessageV30 = require('./StreamrBinaryMessageV30')

module.exports = {
    fromBytes: (buf) => {
        const reader = buf instanceof BufferReader ? buf : new BufferReader(buf)
        const version = reader.nextInt8()
        if (version === StreamrBinaryMessageV28.VERSION) {
            return StreamrBinaryMessageV28.fromBytes(reader)
        } else if (version === StreamrBinaryMessageV29.VERSION) {
            return StreamrBinaryMessageV29.fromBytes(reader)
        } else if (version === StreamrBinaryMessageV30.VERSION) {
            return StreamrBinaryMessageV30.fromBytes(reader)
        }
        throw new Error(`Unknown version: ${version}`)
    },
}
