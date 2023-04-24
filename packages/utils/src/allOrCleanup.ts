/**
 * Given an iterable of promises, settles them one at a time.
 * If all of them resolve, returns the list of values.
 * If one of them rejects, provides a callback for cleaning up the
 * preceding (already resolved) values.
 */
export async function allOrCleanup<T>(
    promises: Iterable<T | PromiseLike<T>>,
    cleanup: (target: T) => Promise<void> | void
): Promise<T[]> {
    const results: T[] = []
    for (const promise of promises) {
        try {
            results.push(await promise)
        } catch (err) {
            await Promise.allSettled(results.map((r) => cleanup(r)))
            throw err
        }
    }
    return results
}
