export class MissingConfigError extends Error {
    readonly message: string
    readonly name: string
    readonly config: string

    constructor(config: string) {
        super()
        this.message = `Config ${config} not set`
        this.name = this.constructor.name
        this.config = config
    }
}
