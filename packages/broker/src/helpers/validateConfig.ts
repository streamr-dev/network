import Ajv, { Schema } from 'ajv'
import addFormats from 'ajv-formats'
import { Todo } from '../types'

export const validateConfig = (data: unknown, schema: Schema, contextName?: string) => {
    const ajv = new Ajv()
    addFormats(ajv)
    if (!ajv.validate(schema, data)) {
        const prefix = (contextName !== undefined) ? (contextName + ': ') : ''
        throw new Error(prefix + ajv.errors!.map((e: Todo) => {
            let text = ajv.errorsText([e], { dataVar: '' } ).trim()
            if (e.params.additionalProperty) {
                text += ` (${e.params.additionalProperty})`
            }
            return text
        }).join('\n'))
    }
}
