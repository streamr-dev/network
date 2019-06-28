module.exports = class UnableToDecryptError extends Error {
    constructor(streamMessage) {
        super(`Unable to decrypt ${streamMessage.getSerializedContent()}`)
        this.streamMessage = streamMessage
    }
}
