/**
 * An Error of Errors
 * Pass an array of errors + message to create
 * Single error without throwing away other errors
 *
 * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/AggregateError
 */

export default class AggregatedError extends Error {
    // specifically not using AggregateError name as this has slightly different API
    constructor(errors = [], errorMessage = '') {
        super(errorMessage)
        this.errors = new Set(errors)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }

    static fromAllSettled(results = [], errorMessage = '') {
        const errs = results.map(({ reason }) => reason).filter(Boolean)
        if (!errs.length) {
            return undefined
        }

        return new AggregatedError(errs, errorMessage)
    }

    static throwAllSettled(results, errorMessage = '') {
        const err = this.fromAllSettled(results, errorMessage)
        if (err) {
            throw err
        }
    }

    /**
     * Handles 'upgrading' an existing error to an AggregatedError when necesary.
     */

    static from(oldErr, newErr, msg) {
        if (newErr && msg) {
            // copy message
            newErr.message = `${msg}: ${newErr.message}` // eslint-disable-line no-param-reassign
        }
        switch (true) {
            // When no oldErr, just return newErr
            case !oldErr: {
                return newErr
            }
            // When oldErr is an AggregatedError, extend it
            case typeof oldErr.extend === 'function': {
                return oldErr.extend(newErr, msg || newErr.message)
            }
            // Otherwise create new AggregatedError from oldErr and newErr
            default: {
                return new AggregatedError([oldErr, newErr], msg || newErr.message)
            }
        }
    }

    /**
     * Create a new error that adds err to list of errors
     */

    extend(err, message = '') {
        if (err === this || this.errors.has(err)) {
            return this
        }

        return new AggregatedError([err, ...this.errors], [message, this.message || ''].join('\n'))
    }
}
