export const collect = async <T>(source: AsyncIterable<T>, maxCount?: number): Promise<T[]> => {
    const items: T[] = []
    for await (const item of source) {
        items.push(item)
        if ((maxCount !== undefined) && (items.length >= maxCount)) {
            break
        }
    }
    return items
}
