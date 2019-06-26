const { CURRENT_VERSION } = require('./messageTypes')

module.exports = class NetworkMessage {
    constructor(code, source) {
        this.version = CURRENT_VERSION
        this.code = code
        this.source = source
    }

    getVersion() {
        return this.version
    }

    getCode() {
        return this.code
    }

    getSource() {
        return this.source
    }

    setSource(source) {
        this.source = source
        return this
    }
}
