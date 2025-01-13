import { isArray, mergeWith } from 'lodash'

/*
 * Does deep merge. This is similar to `lodash` merge, but handles arrays differently:
 * `lodash` merges elements of arrays by their indices, this overwrites the existing
 * value with the array
 */
export const merge = <TTarget>(...sources: (Partial<TTarget> | undefined)[]): TTarget => {
    const result: Record<string, unknown> = {}
    mergeWith(result, ...sources, (_: any, srcValue: any) => {
        if (isArray(srcValue)) {
            return [...srcValue]
        } else {
            return undefined // no customization: does the default merging for this field
        }
    })
    return result as TTarget
}
