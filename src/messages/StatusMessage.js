const BasicMessage = require('./BasicMessage')

module.exports = class StatusMessage extends BasicMessage {
    getStatus() {
        return this.payload
    }

    setStatus(status) {
        this.payload = status
    }
}
