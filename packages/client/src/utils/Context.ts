import { Debugger } from './log'

export const InjectContext = Symbol('Context')

export abstract class Context {
    /** @internal */
    readonly id!: string
    /** @internal */
    readonly debug!: Debugger
}

export class ContextError extends Error {
    public context: Context
    public code?: string
    
    constructor(context: Context, message: string) {
        super(`${context?.id}: ${message}`)
        this.context = context
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

