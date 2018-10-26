import StreamAndPartition from './StreamAndPartition'

module.exports = class UnsubscribeResponse extends StreamAndPartition {
    static getMessageType() {
        return 3
    }
    static getMessageName() {
        return 'UnsubscribeResponse'
    }
}
