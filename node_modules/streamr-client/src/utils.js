/**
 * Converts a .once event listener into a promise.
 * Rejects if an 'error' event is received before resolving.
 */

export function waitFor(emitter, event) {
    return new Promise((resolve, reject) => {
        let onError
        const onEvent = (value) => {
            emitter.off('error', onError)
            resolve(value)
        }
        onError = (error) => {
            emitter.off(event, onEvent)
            reject(error)
        }

        emitter.once(event, onEvent)
        emitter.once('error', onError)
    })
}
