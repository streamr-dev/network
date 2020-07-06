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
}
