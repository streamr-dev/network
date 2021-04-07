module.exports = class MissingConfigError extends Error {
    constructor(config) {
        super()
        this.message = `Config ${config} not set`
        this.name = this.constructor.name
        this.config = config
    }
}
