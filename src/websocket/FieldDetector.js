const HttpError = require('../errors/HttpError')

module.exports = class FieldDetector {
    constructor(streamFetcher) {
        this.streamFetcher = streamFetcher
        this.configuredStreamIds = new Set()
    }

    async detectAndSetFields(stream, streamMessage, apiKey, sessionToken) {
        if (this._shouldDetectAndSet(stream)) {
            this.configuredStreamIds.add(stream.id)

            const content = streamMessage.getParsedContent()
            const fields = []

            Object.keys(content).forEach((key) => {
                let type
                if (Array.isArray(content[key])) {
                    type = 'list'
                } else if ((typeof content[key]) === 'object') {
                    type = 'map'
                } else {
                    type = typeof content[key]
                }
                fields.push({
                    name: key,
                    type,
                })
            })
            try {
                await this.streamFetcher.setFields(stream.id, fields, apiKey, sessionToken)
            } catch (e) {
                // Can try again unless we get a 403 response (permission denied)
                if (!(e instanceof HttpError && e.code === 403)) {
                    this.configuredStreamIds.delete(stream.id)
                }
                throw e
            }
        }
    }

    _shouldDetectAndSet(stream) {
        return stream.autoConfigure
            && (!stream.config || !stream.config.fields || stream.config.fields.length === 0)
            && !this.configuredStreamIds.has(stream.id)
    }
}
