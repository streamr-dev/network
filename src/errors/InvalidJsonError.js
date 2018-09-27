module.exports = class InvalidJsonError extends Error {
    constructor(streamId, jsonString, parseError, offset, previousOffset) {
        super(`Invalid JSON in stream ${streamId}: ${jsonString}. Error while parsing was: ${parseError}`)
        this.streamId = streamId
        this.jsonString = jsonString
        this.parseError = parseError
        this.offset = offset
        this.previousOffset = previousOffset
    }
}
