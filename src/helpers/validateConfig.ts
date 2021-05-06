import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { Config } from '../config'
import { Todo } from '../types'
import BROKER_CONFIG_SCHEMA from './config.schema.json'

const assertProperty = (property: keyof Config, item: any) => {
    if (item[property] == null) {
        throw new Error(`Configuration must have required property '${property}'`)
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
        assertProperty('cassandra', config)
        assertProperty('storageConfig', config)
    } else {
        assertProperty('storageNodeRegistry', config)
    }
}
