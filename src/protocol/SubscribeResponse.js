import StreamAndPartition from './StreamAndPartition'

module.exports = class SubscribeResponse extends StreamAndPartition {
    static getMessageType() {
        return 2
    }
    static getMessageName() {
        return 'SubscribeResponse'
    }
}
