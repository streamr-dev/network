'use strict'

const { TsJestTransformer } = require('ts-jest')

class ImportMetaTransformer extends TsJestTransformer {
    process(sourceText, sourcePath, options) {
        const transformedSource = sourceText.replace(
            /import\.meta\.url/g,
            '`file://${__filename}`'
        )
        return super.process(transformedSource, sourcePath, options)
    }

    async processAsync(sourceText, sourcePath, options) {
        const transformedSource = sourceText.replace(
            /import\.meta\.url/g,
            '`file://${__filename}`'
        )
        return super.processAsync(transformedSource, sourcePath, options)
    }
}

module.exports = {
    createTransformer(tsJestConfig) {
        return new ImportMetaTransformer(tsJestConfig)
    },
}
