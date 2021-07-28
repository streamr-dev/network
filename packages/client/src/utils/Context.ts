import { Debugger } from './log'

export const InjectContext = Symbol('Context')

export abstract class Context {
    readonly id!: string
    readonly debug!: Debugger
}

export class ContextError extends Error {
    context: Context
    constructor(context: Context, message: string = '') {
        super(`${context.id}: ${message}`)
        this.context = context
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

