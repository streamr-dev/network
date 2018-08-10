'use strict'

const MESSAGE_CODES = {
    STATUS: 0x00,
    PEERS: 0x01,
    DATA: 0x02
  }

class StreamrProtocol extends EventEmitter {
    constructor(options) {
        super()
    }

    handleMessage(code, payload) {

    }

    sendStatus (status) {
        
    }

    sendMessage(code, payload) {
    }
}

StreamrProtocol.MESSAGE_CODES = MESSAGE_CODES
StreamrProtocol.strmr1 = { name: 'strmr-p2p', version: 1, constructor: StreamrProtocol };

module.exports = StreamrProtocol