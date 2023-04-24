export const merge = (...sources: readonly Record<string, unknown>[]): Record<string, unknown> => {
    const result: Record<string, unknown> = {}
    for (const source of sources) {
        for (const [key, value] of Object.entries(source)) {
            if (value !== undefined) {
                result[key] = value
            }
        }
    }
    return result
}
