/**
 * An Error of Errors
 * Pass an array of errors + message to create
 * Single error without throwing away other errors
 * Specifically not using AggregateError name as this has slightly different API
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError
 */

function joinMessages(msgs: (string | undefined)[]): string {
    return msgs.filter(Boolean).join('\n')
}

function getStacks(err: Error | AggregatedError) {
    if (err instanceof AggregatedError) {
        return [
            err.ownStack,
            ...[...err.errors].map(({ stack }) => stack)
        ]
    }

    return [err.stack]
}

function joinStackTraces(errs: Error[]): string {
    return errs.flatMap((err) => getStacks(err)).filter(Boolean).join('\n')
}

export default class AggregatedError extends Error {
    errors: Set<Error>
    ownMessage: string
    ownStack?: string
    constructor(errors: Error[] = [], errorMessage = '') {
        const message = joinMessages([
            errorMessage,
            ...errors.map((err) => err.message)
        ])
        super(message)
        errors.forEach((err) => {
            Object.assign(this, err)
        })
        this.message = message
        this.ownMessage = errorMessage
        this.errors = new Set(errors)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
        this.ownStack = this.stack
        this.stack = joinStackTraces(errors)
    }

    /**
     * Combine any errors from Promise.allSettled into AggregatedError.
     */
    static fromAllSettled(results = [], errorMessage = '') {
        const errs = results.map(({ reason }) => reason).filter(Boolean)
        if (!errs.length) {
            return undefined
        }

        return new this(errs, errorMessage)
    }

    /**
     * Combine any errors from Promise.allSettled into AggregatedError and throw it.
     */
    static throwAllSettled(results = [], errorMessage = '') {
        const err = this.fromAllSettled(results, errorMessage)
        if (err) {
            throw err
        }
    }

    /**
     * Handles 'upgrading' an existing error to an AggregatedError when necesary.
     */
    static from(oldErr?: Error | AggregatedError, newErr?: Error, msg?: string) {
        if (!newErr) {
            if (oldErr && msg) {
                // copy message
                oldErr.message = joinMessages([oldErr.message, msg]) // eslint-disable-line no-param-reassign
            }
            return oldErr
        }

        // When no oldErr, just return newErr
        if (!oldErr) {
            if (newErr && msg) {
                // copy message
                newErr.message = joinMessages([newErr.message, msg]) // eslint-disable-line no-param-reassign
            }
            return newErr
        }

        // When oldErr is an AggregatedError, extend it
        if (oldErr instanceof AggregatedError) {
            return oldErr.extend(newErr, msg, this)
        }

        // Otherwise create new AggregatedError from oldErr and newErr
        return new this([oldErr]).extend(newErr, msg)
    }

    /**
     * Create a new error that adds err to list of errors
     */

    extend(err: Error, message = '', baseClass = this.constructor): AggregatedError {
        if (err === this || this.errors.has(err)) {
            return this
        }
        const errors = [err, ...this.errors]
        return new (<typeof AggregatedError> baseClass)(errors, joinMessages([message, this.ownMessage]))
    }
}
