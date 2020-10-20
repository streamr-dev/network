const HttpError = require('../errors/HttpError')

const shouldDetectAndSet = (stream) => {
    return stream.autoConfigure
        && (!stream.config || !stream.config.fields || stream.config.fields.length === 0)
}

module.exports = class FieldDetector {
    constructor(streamFetcher) {
        this.streamFetcher = streamFetcher
        this.configuredStreamIds = new Set()
    }

    async detectAndSetFields(streamMessage, apiKey, sessionToken) {
        if (this.configuredStreamIds.has(streamMessage.getStreamId())) {
            return
        }

        try {
            this.configuredStreamIds.add(streamMessage.getStreamId())
            const stream = await this.streamFetcher.fetch(streamMessage.getStreamId(), apiKey, sessionToken)

            if (shouldDetectAndSet(stream)) {
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
                await this.streamFetcher.setFields(stream.id, fields, apiKey, sessionToken)
            }
        } catch (e) {
            // Can try again unless we get a 403 response (permission denied) or 401 response ()
            if (!(e instanceof HttpError && (e.code === 403 || e.code === 401))) {
                this.configuredStreamIds.delete(streamMessage.getStreamId())
            }
            throw e
        }
    }
}
