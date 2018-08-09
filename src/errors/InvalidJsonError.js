module.exports = class InvalidJsonError extends Error {
    constructor(streamId, jsonString, parseError) {
        super(`Invalid JSON in stream ${streamId}: ${jsonString}. Error while parsing was: ${parseError}`)
        this.streamId = streamId
        this.jsonString = jsonString
        this.parseError = parseError
    }
}
