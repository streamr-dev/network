import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { Todo } from '../types'
import BROKER_CONFIG_SCHEMA from './config.schema.json'

export const validateConfig = (config: Todo) => {
    const ajv = new Ajv()
    addFormats(ajv)
    if (!ajv.validate(BROKER_CONFIG_SCHEMA, config)) {
        throw new Error(ajv.errors!.map((e: Todo) => {
            let text = ajv.errorsText([e])
            if (e.params.additionalProperty) {
                text += ` (${e.params.additionalProperty})`
            }
            return text
        }).join('\n'))
    }
}
