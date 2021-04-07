export function promiseTimeout<T>(ms: number, givenPromise: Promise<T>): Promise<T> {
    const timeoutPromise = new Promise((resolve, reject) => {
        const timeoutRef = setTimeout(() => {
            reject(new Error('timed out in ' + ms + 'ms.'))
        }, ms)

        // Clear timeout if promise wins race
        givenPromise
            .finally(() => clearTimeout(timeoutRef))
            .catch(() => null)
    })

    return Promise.race([
        givenPromise,
        timeoutPromise
    ]) as Promise<T>
}
