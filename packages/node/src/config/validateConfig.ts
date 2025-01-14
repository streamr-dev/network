import Ajv, { Schema, ErrorObject } from 'ajv'
import addFormats from 'ajv-formats'
import { StrictConfig } from './config'
import DEFINITIONS_SCHEMA from './definitions.schema.json'

export const validateConfig = (
    data: unknown,
    schema: Schema,
    contextName?: string,
    useDefaults = true
): StrictConfig => {
    const ajv = new Ajv({
        useDefaults
    })
    addFormats(ajv)
    ajv.addFormat('ethereum-address', /^0x[a-zA-Z0-9]{40}$/)
    ajv.addSchema(DEFINITIONS_SCHEMA)
    if (!ajv.validate(schema, data)) {
        const prefix = contextName !== undefined ? contextName + ': ' : ''
        throw new Error(
            prefix +
                ajv
                    .errors!.map((e: ErrorObject) => {
                        let text = ajv.errorsText([e], { dataVar: '' }).trim()
                        if (e.params.additionalProperty) {
                            // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
                            text += ` (${e.params.additionalProperty})`
                        }
                        return text
                    })
                    .join('\n')
        )
    }
    return data as StrictConfig
}

export const isValidConfig = (data: unknown, schema: Schema): boolean => {
    try {
        validateConfig(data, schema, undefined, false)
        return true
    } catch (_e) {
        return false
    }
}
