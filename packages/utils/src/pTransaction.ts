/**
 * Given an iterable of promises, settles them one at a time.
 * If all of them resolve, returns the list of values.
 * If one of them rejects, provides a callback for reverting the
 * preceding (already resolved) values.
 */
export async function pTransaction<T>(
    promises: Iterable<T | PromiseLike<T>>,
    rollback: (target: T) => Promise<void> | void
): Promise<T[]> {
    const results: T[] = []
    for (const promise of promises) {
        try {
            results.push(await promise)
        } catch (err) {
            await Promise.allSettled(results.map((r) => rollback(r)))
            throw err
        }
    }
    return results
}
