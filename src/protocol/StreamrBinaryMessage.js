const VERSION = 28 // 0x1C
const VERSION_SIGNED = 29 // 0x1D
const CONTENT_TYPE_JSON = 27 // 0x1B

class StreamrBinaryMessage {
    constructor() {
        if (new.target === StreamrBinaryMessage) {
            throw new TypeError('StreamrBinaryMessage is abstract.')
        }
    }
}

/* static */ StreamrBinaryMessage.VERSION = VERSION
/* static */ StreamrBinaryMessage.VERSION_SIGNED = VERSION_SIGNED
/* static */ StreamrBinaryMessage.CONTENT_TYPE_JSON = CONTENT_TYPE_JSON

module.exports = StreamrBinaryMessage
