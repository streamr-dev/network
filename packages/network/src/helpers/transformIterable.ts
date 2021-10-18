export const transformIterable = function *<F,T>(from: Iterable<F>, tranform: (f: F) => T): Iterable<T> {
    for (const f of from) {
        yield tranform(f)
    }
}