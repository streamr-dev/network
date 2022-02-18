import Ajv, { Schema, ErrorObject } from 'ajv'
import addFormats from 'ajv-formats'

export const validateConfig = (data: unknown, schema: Schema, contextName?: string, useDefaults = true): void|never => {
    const ajv = new Ajv({
        useDefaults
    })
    addFormats(ajv)
    if (!ajv.validate(schema, data)) {
        const prefix = (contextName !== undefined) ? (contextName + ': ') : ''
        throw new Error(prefix + ajv.errors!.map((e: ErrorObject) => {
            let text = ajv.errorsText([e], { dataVar: '' } ).trim()
            if (e.params.additionalProperty) {
                text += ` (${e.params.additionalProperty})`
            }
            return text
        }).join('\n'))
    }
}

export const isValidConfig = (data: unknown, schema: Schema): boolean => {
    try {
        validateConfig(data, schema, undefined, false)
        return true
    } catch (_e) {
        return false
    }
}