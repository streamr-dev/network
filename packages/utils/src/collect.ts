export const collect = async <T>(source: AsyncIterable<T>, maxCount?: number): Promise<T[]> => {
    if (maxCount !== undefined && maxCount <= 0) {
        return []
    }
    const items: T[] = []
    for await (const item of source) {
        items.push(item)
        if (maxCount !== undefined && items.length >= maxCount) {
            break
        }
    }
    return items
}
