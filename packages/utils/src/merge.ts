export const merge = <TTarget>(...sources: (Partial<TTarget> | undefined)[]): TTarget => {
    const result: Record<string, unknown> = {}
    for (const source of sources) {
        if (source !== undefined) {
            for (const [key, value] of Object.entries(source)) {
                if (value !== undefined) {
                    result[key] = value
                }
            }
        }
    }
    return result as TTarget
}
