export class AbortError extends Error {
    readonly code = 'AbortError'
    constructor(customErrorContext?: string) {
        super(customErrorContext === undefined
            ? `aborted`
            : `${customErrorContext} aborted`)
        Error.captureStackTrace(this, AbortError)
    }
}
