import { MaybeAsync } from '../types'

export type GeneratorForEach<InType> = MaybeAsync<(value: InType, index: number, src: AsyncGenerator<InType>) => void>
export type GeneratorFilter<InType> = MaybeAsync<(value: InType, index: number, src: AsyncGenerator<InType>) => any>
export type GeneratorMap<InType, OutType> = (value: InType, index: number, src: AsyncGenerator<InType>) => OutType | Promise<OutType>
export type GeneratorReduce<InType, OutType> = (
    prevValue: OutType, value: InType, index: number, src: AsyncGenerator<InType>
) => OutType | Promise<OutType>

type OnError<ValueType> = (err: Error, value: ValueType, index: number) => Promise<any> | any

const noopConsume = async (src: AsyncGenerator) => {
    // eslint-disable-next-line no-underscore-dangle
    for await (const _msg of src) {
        // noop, just consume
    }
}

/**
 * Similar to Array#forEach or Stream.PassThrough.
 * Allows inspection of a pipeline without mutating it.
 * Note: Pipeline will block until forEach call resolves.
 */
export async function* forEach<InType>(
    src: AsyncGenerator<InType>,
    fn: GeneratorForEach<InType>,
    onError?: OnError<InType>
): AsyncGenerator<InType> {
    let index = 0
    for await (const v of src) {
        try {
            await fn(v, index, src)
        } catch (err) {
            if (onError) {
                await onError(err, v, index)
                continue
            } else {
                throw err
            }
        } finally {
            index += 1
        }
        yield v
    }
}

/**
 * Similar to Array#map or Stream.Transform.
 */
export async function* map<InType, OutType>(
    src: AsyncGenerator<InType>,
    fn: GeneratorMap<InType, OutType>,
    onError?: OnError<InType>
): AsyncGenerator<OutType> {
    let index = 0
    for await (const v of src) {
        try {
            yield await fn(v, index, src)
        } catch (err) {
            if (onError) {
                await onError(err, v, index)
                continue
            } else {
                throw err
            }
        } finally {
            index += 1
        }
    }
}

/**
 * Similar to Array#filter
 */
export async function* filter<InType>(
    src: AsyncGenerator<InType>,
    fn: GeneratorFilter<InType>,
    onError?: OnError<InType>
): AsyncGenerator<InType> {
    let index = 0
    for await (const v of src) {
        let ok
        try {
            ok = await fn(v, index, src)
        } catch (err) {
            if (onError) {
                await onError(err, v, index)
                continue
            } else {
                throw err
            }
        } finally {
            index += 1
        }
        if (ok) {
            yield v
        }
    }
}
/**
 * Similar to Array#reduce, but more different than the other methods here.
 * This is perhaps more like an Array#map but it also passes the previous return value.
 * Still yields for each item, but passes previous return value to next iteration.
 * initialValue is passed as the previous value on first iteration.
 * Unlike Array#reduce, initialValue is required.
 */
export async function* reduce<InType, OutType>(
    src: AsyncGenerator<InType>,
    fn: GeneratorReduce<InType, OutType>,
    initialValue: OutType,
    onError?: OnError<InType>
): AsyncGenerator<OutType> {
    let result = initialValue
    yield* map(src, async (value, index, srcGen) => {
        result = await fn(result, value, index, srcGen) // eslint-disable-line require-atomic-updates
        return result
    }, onError)
}

/**
 * Consume generator and collect results into an array.
 * Can take an optional number of items to consume.
 */
export async function collect<InType>(
    src: AsyncGenerator<InType>,
    /** number of items to consume before ending, consumes all if undefined */
    n?: number,
    onError?: OnError<InType>
): Promise<InType[]> {
    const results: InType[] = []
    await consume(src, async (value, index, srcGen) => {
        results.push(value)
        if (n != null && index === n - 1) {
            await srcGen.return(undefined)
        }
    }, onError)

    return results
}

/**
 * Start consuming generator.
 * Takes optional forEach function.
 */
export async function consume<InType>(
    src: AsyncGenerator<InType>,
    fn: GeneratorForEach<InType> = (v) => v,
    onError?: OnError<InType>
): Promise<void> {
    return noopConsume(forEach(src, fn, onError))
}

export async function* unique<T>(
    source: AsyncGenerator<T>,
    getIdentity: (item: T) => string
): AsyncGenerator<T> {
    const seenIdentities = new Set<string>()
    for await (const item of source) {
        const identity = getIdentity(item)
        if (!seenIdentities.has(identity)) {
            seenIdentities.add(identity)
            yield item
        }
    }
}
