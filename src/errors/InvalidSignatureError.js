module.exports = class InvalidSignatureError extends Error {
    constructor(streamMessage) {
        super(`Invalid message signature: ${streamMessage.serialize()}`)
        this.streamMessage = streamMessage
    }
}
