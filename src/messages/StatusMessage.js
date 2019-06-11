const { msgTypes } = require('./messageTypes')
const NetworkMessage = require('./NetworkMessage')

module.exports = class StatusMessage extends NetworkMessage {
    constructor(status, source = null) {
        super(msgTypes.STATUS, source)
        if (typeof status === 'undefined') {
            throw new Error('status cant be undefined')
        }
        this.status = status
    }

    getStatus() {
        return this.status
    }

    setStatus(status) {
        this.status = status
        return this
    }

    toJSON() {
        return {
            version: this.getVersion(),
            code: this.getCode(),
            source: this.getSource(),
            status: this.getStatus()
        }
    }
}
