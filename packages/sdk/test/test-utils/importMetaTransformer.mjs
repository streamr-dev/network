'use strict'

import { TsJestTransformer } from 'ts-jest'

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

export default {
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    createTransformer(tsJestConfig) {
        return new ImportMetaTransformer(tsJestConfig)
    },
}
