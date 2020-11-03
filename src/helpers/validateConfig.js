const Ajv = require('ajv')

const BROKER_CONFIG_SCHEMA = require('./config.schema.json')

module.exports = function validateConfig(config) {
    const ajv = new Ajv()
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
