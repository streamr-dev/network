import pMemoize from 'p-memoize'
import LRU from '../../vendor/quick-lru'

interface Collection<K, V> {
    keys: Map<K, V>['keys']
    delete: Map<K, V>['delete']
}

function clearMatching<K>(cache: Collection<K, unknown>, matchFn: (key: K) => boolean): void {
    for (const key of cache.keys()) {
        if (matchFn(key)) {
            cache.delete(key)
        }
    }
}

export type CacheAsyncFnType<ArgsType extends any[], ReturnType, KeyType = ArgsType[0]> = ((...args: ArgsType) => Promise<ReturnType>) 
    & { clearMatching: (matchFn: (key: KeyType) => boolean) => void }

/**
 * Returns a cached async fn, cached keyed on first argument passed. See documentation for mem/p-memoize.
 * Caches into a LRU cache capped at options.maxSize
 * Won't call asyncFn again until options.maxAge or options.maxSize exceeded, or cachedAsyncFn.clear() is called.
 * Won't cache rejections by default. Override with options.cachePromiseRejection = true.
 *
 * ```js
 * const cachedAsyncFn = CacheAsyncFn(asyncFn, options)
 * await cachedAsyncFn(key)
 * await cachedAsyncFn(key)
 * cachedAsyncFn.clear()
 * ```
 */
export function CacheAsyncFn<ArgsType extends any[], ReturnType, KeyType = ArgsType[0]>(asyncFn: (...args: ArgsType) => PromiseLike<ReturnType>, {
    maxSize = 10000,
    maxAge = 30 * 60 * 1000, // 30 minutes
    cachePromiseRejection = false,
    onEviction = () => {},
    cacheKey = (args: ArgsType) => args[0], // type+provide default so we can infer KeyType
}: {
    maxSize?: number
    maxAge?: number
    cachePromiseRejection?: boolean
    onEviction?: (...args: any[]) => void
    cacheKey?: (args: ArgsType) => KeyType
} = {}): CacheAsyncFnType<ArgsType, ReturnType, KeyType> {
    const cache = new LRU<KeyType, { data: ReturnType, maxAge: number }>({
        maxSize,
        maxAge,
        onEviction,
    })

    const cachedFn = Object.assign(pMemoize(asyncFn, {
        cachePromiseRejection,
        cache,
        cacheKey
    }), {
        clearMatching: (matchFn: ((key: KeyType) => boolean)) => clearMatching(cache, matchFn),
    })

    return cachedFn
}
