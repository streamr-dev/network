import ResendResponse from './ResendResponse'

module.exports = class ResendResponseResent extends ResendResponse {
    static getMessageType() {
        return 5
    }
    static getMessageName() {
        return 'ResendResponseResent'
    }
}
