module.exports = class BasicMessage {
    constructor(version, code, source, payload) {
        this.version = version || ''
        this.code = code || ''
        this.source = source || ''
        this.payload = payload || []
    }

    getVersion() {
        return this.version
    }

    setVersion(version) {
        this.version = version
    }

    getCode() {
        return this.code
    }

    setCode(code) {
        this.code = code
    }

    getPayload() {
        return this.payload
    }

    setPayload(payload) {
        this.payload = payload
    }

    getSource() {
        return this.source
    }

    setSource(source) {
        this.source = source
    }

    toJSON() {
        return {
            version: this.getVersion(),
            code: this.getCode(),
            source: this.getSource(),
            payload: this.getPayload()
        }
    }
}
