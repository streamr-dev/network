import Ajv, { Schema } from 'ajv'
import addFormats from 'ajv-formats'
import { Config } from '../config'
import { Todo } from '../types'
import BROKER_CONFIG_SCHEMA from './config.schema.json'

const assertProperty = (property: keyof Config, item: any) => {
    if (item[property] == null) {
        throw new Error(`Configuration must have required property '${property}'`)
    }
}

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

export const validateBrokerConfig = (config: Config) => {
    validateConfig(config, BROKER_CONFIG_SCHEMA)
    if (config.network.isStorageNode) {
        assertProperty('cassandra', config)
        assertProperty('storageConfig', config)
    } else {
        assertProperty('storageNodeRegistry', config)
    }
}
