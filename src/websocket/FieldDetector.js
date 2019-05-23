module.exports = class FieldDetector {
    constructor(streamFetcher) {
        this.streamFetcher = streamFetcher
        this.configuredStreamIds = new Set()
    }

    async detectAndSetFields(stream, streamMessage, apiKey, sessionToken) {
        if (this._shouldDetectAndSet(stream)) {
            this.configuredStreamIds.add(stream.streamId)

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
                await this.streamFetcher.setFields(stream.streamId, fields, apiKey, sessionToken)
            } catch (e) {
                this.configuredStreamIds.delete(stream.streamId)
                throw e
            }
        }
    }

    _shouldDetectAndSet(stream) {
        return stream.autoConfigure
            && (!stream.config || !stream.config.fields || stream.config.fields.length === 0)
            && !this.configuredStreamIds.has(stream.streamId)
    }
}
