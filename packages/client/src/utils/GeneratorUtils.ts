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

export async function collect<InType>(
    src: AsyncGenerator<InType>,
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

export async function consume<InType>(
    src: AsyncGenerator<InType>,
    fn: GeneratorForEach<InType> = (v) => v,
): Promise<void> {
    return noopConsume(forEach(src, fn))
}
