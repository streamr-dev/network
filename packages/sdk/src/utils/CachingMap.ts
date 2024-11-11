import { MapKey } from '@streamr/utils'
import pMemoize from 'p-memoize'
import LRU from '../../vendor/quick-lru'

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
export class CachingMap<ArgsType extends any[], ReturnType, KeyType extends MapKey> {

    private readonly cachedFn: (...args: ArgsType) => Promise<ReturnType>
    private readonly cache: LRU<KeyType, { data: ReturnType, maxAge: number }>

    constructor(
        asyncFn: (...args: ArgsType) => Promise<ReturnType>,
        opts: {
            maxSize: number
            maxAge: number
            cacheKey: (args: ArgsType) => KeyType
        }
    ) {
        this.cache = new LRU<KeyType, { data: ReturnType, maxAge: number }>({
            maxSize: opts.maxSize,
            maxAge: opts.maxAge
        })
        this.cachedFn = pMemoize(asyncFn, {
            cachePromiseRejection: false,
            cache: this.cache,
            cacheKey: opts.cacheKey
        })
    }

    get(...args: ArgsType): Promise<ReturnType> {
        return this.cachedFn(...args)
    }

    invalidate(predicate: (key: KeyType) => boolean): void {
        for (const key of this.cache.keys()) {
            if (predicate(key)) {
                this.cache.delete(key)
            }
        }
    }
}
