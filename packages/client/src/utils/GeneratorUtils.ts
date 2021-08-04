import { MaybeAsync } from '../types'

export type GeneratorForEach<InType> = MaybeAsync<(value: InType, index: number, src: AsyncGenerator<InType>) => void>
export type GeneratorFilter<InType> = MaybeAsync<(value: InType, index: number, src: AsyncGenerator<InType>) => any>
export type GeneratorMap<InType, OutType> = (value: InType, index: number, src: AsyncGenerator<InType>) => OutType | Promise<OutType>
export type GeneratorReduce<InType, OutType> = (
    prevValue: OutType, value: InType, index: number, src: AsyncGenerator<InType>
) => OutType | Promise<OutType>

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
    fn: GeneratorForEach<InType>
): AsyncGenerator<InType> {
    let index = 0
    for await (const v of src) {
        await fn(v, index, src)
        index += 1
        yield v
    }
}

/**
 * Similar to Array#map or Stream.Transform.
 */
export async function* map<InType, OutType>(
    src: AsyncGenerator<InType>,
    fn: GeneratorMap<InType, OutType>
): AsyncGenerator<OutType> {
    let index = 0
    for await (const v of src) {
        yield await fn(v, index, src)
        index += 1
    }
}

/**
 * Similar to Array#filter
 */
export async function* filter<InType>(
    src: AsyncGenerator<InType>,
    fn: GeneratorFilter<InType>
): AsyncGenerator<InType> {
    let index = 0
    for await (const v of src) {
        const ok = await fn(v, index, src)
        index += 1
        if (ok) {
            yield v
        } else {
            continue
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
    initialValue: OutType
): AsyncGenerator<OutType> {
    let result = initialValue
    yield* map(src, async (value, index, srcGen) => {
        result = await fn(result, value, index, srcGen) // eslint-disable-line require-atomic-updates
        return result
    })
}

/**
 * Consume generator and collect results into an array.
 * Can take an optional number of items to consume.
 */
export async function collect<InType>(
    src: AsyncGenerator<InType>,
    /** number of items to consume before ending, consumes all if undefined */
    n?: number,
): Promise<InType[]> {
    const results: InType[] = []
    await consume(src, async (value, index, srcGen) => {
        results.push(value)
        if (n != null && index === n - 1) {
            await srcGen.return(undefined)
        }
    })

    return results
}

/**
 * Start consuming generator.
 * Takes optional forEach function.
 */
export async function consume<InType>(
    src: AsyncGenerator<InType>,
    fn: GeneratorForEach<InType> = (v) => v,
): Promise<void> {
    return noopConsume(forEach(src, fn))
}
