import { MapKey } from '@streamr/utils'
import pMemoize from 'p-memoize'
import LRU from '../../vendor/quick-lru'

interface Options<P, K> {
    maxSize: number
    maxAge: number
    cacheKey: (args: P) => K
}

/**
 * Caches into a LRU cache capped at options.maxSize. See documentation for mem/p-memoize.
 * Won't call asyncFn again until options.maxAge or options.maxSize exceeded, or cachedAsyncFn.invalidate() is called.
 * Won't cache rejections.
 *
 * ```js
 * const cache = new CachingMap(asyncFn, opts)
 * await cache.get(key)
 * await cache.get(key)
 * cache.invalidate(() => ...)
 * ```
 */
export class CachingMap<K extends MapKey, V, P extends any[]> {

    private readonly cachedFn: (...args: P) => Promise<V>
    private readonly cache: LRU<K, { data: V, maxAge: number }>
    private readonly opts: Options<P, K>

    constructor(
        asyncFn: (...args: P) => Promise<V>,
        opts: Options<P, K>
    ) {
        this.cache = new LRU<K, { data: V, maxAge: number }>({
            maxSize: opts.maxSize,
            maxAge: opts.maxAge
        })
        this.cachedFn = pMemoize(asyncFn, {
            cachePromiseRejection: false,
            cache: this.cache,
            cacheKey: opts.cacheKey
        })
        this.opts = opts
    }

    get(...args: P): Promise<V> {
        return this.cachedFn(...args)
    }

    set(args: P, value: V): void {
        this.cache.set(this.opts.cacheKey(args), { data: value, maxAge: this.opts.maxAge })
    }

    invalidate(predicate: (key: K) => boolean): void {
        for (const key of this.cache.keys()) {
            if (predicate(key)) {
                this.cache.delete(key)
            }
        }
    }
}
