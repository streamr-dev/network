import * as myself from './ParseUtil'

export default myself

export function ensureParsed(stringOrObject) {
    return (typeof stringOrObject === 'string' ? JSON.parse(stringOrObject) : stringOrObject)
}
