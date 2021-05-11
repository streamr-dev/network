import { Todo } from '../types'

export class MissingConfigError extends Error {

    message: string
    name: string
    config: Todo

    constructor(config: Todo) {
        super()
        this.message = `Config ${config} not set`
        this.name = this.constructor.name
        this.config = config
    }
}
