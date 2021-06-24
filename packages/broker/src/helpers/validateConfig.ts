import Ajv, { Schema } from 'ajv'
import addFormats from 'ajv-formats'
import { Config } from '../config'
import { getPluginDefinition } from '../pluginRegistry'
import { Todo } from '../types'
import BROKER_CONFIG_SCHEMA from './config.schema.json'

const validateConfig = (data: unknown, schema: Schema, contextName?: string) => {
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
    const plugins = config.plugins
    Object.keys(plugins).forEach((name) => {
        const schema = getPluginDefinition(name).getConfigSchema()
        if (schema !== undefined) {
            const config = plugins[name]
            validateConfig(config, schema, `${name} plugin`)
        }
    })
}
