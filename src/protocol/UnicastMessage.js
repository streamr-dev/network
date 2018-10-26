import StreamMessage from './StreamMessage'

module.exports = class UnicastMessage extends StreamMessage {
    static getMessageType() {
        return 1
    }
    static getMessageName() {
        return 'UnicastMessage'
    }
}
