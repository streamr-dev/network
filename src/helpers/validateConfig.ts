import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { Config } from '../config'
import { Todo } from '../types'
import BROKER_CONFIG_SCHEMA from './config.schema.json'

const assertStorageNodeProperty = (property: keyof Config, item: any) => {
    if (item[property] == null) {
        throw new Error(`Storage node configuration must have required property '${property}'`)
    }
}

export const validateConfig = (config: Config) => {
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
    if (config.network.isStorageNode) {
        assertStorageNodeProperty('cassandra', config)
        assertStorageNodeProperty('storageConfig', config)
    }
}
