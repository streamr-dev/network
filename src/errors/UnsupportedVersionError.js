module.exports = class UnsupportedVersionError extends Error {
    constructor(version, message) {
        super(`Unsupported version: ${version}, message: ${message}`)
        this.version = version
        this.message = message
    }
}
