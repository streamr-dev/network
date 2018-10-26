import StreamMessage from './StreamMessage'

module.exports = class BroadcastMessage extends StreamMessage {
    static getMessageType() {
        return 0
    }
    static getMessageName() {
        return 'BroadcastMessage'
    }
}
