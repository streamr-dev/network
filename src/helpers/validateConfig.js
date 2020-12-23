const Ajv = require('ajv').default
const addFormats = require('ajv-formats')

const BROKER_CONFIG_SCHEMA = require('./config.schema.json')

module.exports = function validateConfig(config) {
    const ajv = new Ajv()
    addFormats(ajv)
    if (!ajv.validate(BROKER_CONFIG_SCHEMA, config)) {
        throw new Error(ajv.errors.map((e) => {
            let text = ajv.errorsText([e])
            if (e.params.additionalProperty) {
                text += ` (${e.params.additionalProperty})`
            }
            return text
        }).join('\n'))
    }
}
