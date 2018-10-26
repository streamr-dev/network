import ResendResponse from './ResendResponse'

module.exports = class ResendResponseResending extends ResendResponse {
    static getMessageType() {
        return 4
    }
    static getMessageName() {
        return 'ResendResponseResending'
    }
}
