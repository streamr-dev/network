import { Debugger, formatWithOptions } from './log'

export const InjectContext = Symbol('Context')

export abstract class Context {
    /** @internal */
    readonly id!: string
    /** @internal */
    readonly debug!: Debugger
}

export class ContextError extends Error {
    context: Context
    code?: string
    constructor(context: Context, message: string = '', ...args: any[]) {
        // @ts-expect-error inspectOpts not in debug types
        super(`${context?.id}: ${formatWithOptions({ ...(context?.debug?.inspectOpts || {}), colors: false }, message, ...args)}`)
        this.context = context
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }
}

