import ResendResponse from './ResendResponse'

module.exports = class ResendResponseNoResend extends ResendResponse {
    static getMessageType() {
        return 6
    }
    static getMessageName() {
        return 'ResendResponseNoResend'
    }
}
