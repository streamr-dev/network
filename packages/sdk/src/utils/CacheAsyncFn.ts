import { MapKey } from '@streamr/utils'
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

export type CacheAsyncFnType<ArgsType extends any[], ReturnType, KeyType extends MapKey> = ((...args: ArgsType) => Promise<ReturnType>) 
    & { clearMatching: (matchFn: (key: KeyType) => boolean) => void }

/**
 * Returns a cached async fn. See documentation for mem/p-memoize.
 * Caches into a LRU cache capped at options.maxSize
 * Won't call asyncFn again until options.maxAge or options.maxSize exceeded, or cachedAsyncFn.clearMatching() is called.
 * Won't cache rejections.
 *
 * ```js
 * const cachedAsyncFn = CacheAsyncFn(asyncFn, options)
 * await cachedAsyncFn(key)
 * await cachedAsyncFn(key)
 * cachedAsyncFn.clearMatching(() => ...)
 * ```
 */

export function CacheAsyncFn<ArgsType extends any[], ReturnType, KeyType extends MapKey>(
    asyncFn: (...args: ArgsType) => PromiseLike<ReturnType>, 
    opts: {
        maxSize: number
        maxAge: number
        cacheKey: (args: ArgsType) => KeyType
    }
): CacheAsyncFnType<ArgsType, ReturnType, KeyType> {
    const cache = new LRU<KeyType, { data: ReturnType, maxAge: number }>({
        maxSize: opts.maxSize,
        maxAge: opts.maxAge
    })

    const cachedFn = Object.assign(pMemoize(asyncFn, {
        cachePromiseRejection: false,
        cache,
        cacheKey: opts.cacheKey
    }), {
        clearMatching: (matchFn: ((key: KeyType) => boolean)) => clearMatching(cache, matchFn),
    })

    return cachedFn
}
