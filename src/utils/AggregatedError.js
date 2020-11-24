export default class AggregatedError extends Error {
    // specifically not using AggregateError name as this has slightly different API
    constructor(errors = [], errorMessage = '') {
        super(errorMessage)
        this.errors = new Set(errors)
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor)
        }
    }

    static from(err, newErr, msg) {
        switch (true) {
            case !err: {
                if (msg) {
                    // copy message
                    newErr.message = msg // eslint-disable-line no-param-reassign
                }

                return newErr
            }
            case typeof err.extend === 'function': {
                return err.extend(newErr, msg || newErr.message)
            }
            default: {
                return new AggregatedError([err, newErr], msg || newErr.message)
            }
        }
    }

    extend(err, message = '') {
        if (err === this || this.errors.has(err)) {
            return this
        }

        return new AggregatedError([err, ...this.errors], [message, this.message || ''].join('\n'))
    }
}
