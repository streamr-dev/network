import { MaybeAsync } from '../types'

export type GeneratorForEach<InType> = MaybeAsync<(value: InType, index: number, src: AsyncGenerator<InType>) => void>
export type GeneratorFilter<InType> = MaybeAsync<(value: InType, index: number, src: AsyncGenerator<InType>) => any>
export type GeneratorMap<InType, OutType> = (
    value: InType,
    index: number,
    src: AsyncGenerator<InType>
) => OutType | Promise<OutType>

type OnError<ValueType> = (err: Error, value: ValueType) => Promise<any> | any

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
                await onError(err, v)
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
                await onError(err, v)
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
                await onError(err, v)
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

export async function* unique<T>(source: AsyncIterable<T>, getIdentity: (item: T) => string): AsyncGenerator<T> {
    const seenIdentities = new Set<string>()
    for await (const item of source) {
        const identity = getIdentity(item)
        if (!seenIdentities.has(identity)) {
            seenIdentities.add(identity)
            yield item
        }
    }
}

export const fromArray = async function* <T>(items: T[]): AsyncGenerator<T> {
    for (const item of items) {
        yield item
    }
}

export const transformError = async function* <T>(
    src: AsyncGenerator<T>,
    transformFn: (err: any) => any
): AsyncGenerator<T> {
    try {
        for await (const item of src) {
            yield item
        }
    } catch (err: any) {
        throw await transformFn(err)
    }
}
