const check = require('check-node-version')
const { engines } = require('../package.json')

check(
    {
        node: engines.node,
        npm: engines.npm
    },
    (error, results) => {
        if (error) {
            console.error(error)
            return
        }

        if (!results.isSatisfied) {
            // eslint-disable-next-line no-restricted-syntax
            for (const packageName of Object.keys(results.versions)) {
                if (!results.versions[packageName].isSatisfied) {
                    console.error(`Required ${packageName} version ${engines[packageName]} not satisfied with current version ${results.versions[packageName].version.version}s\n\n`)
                }
            }

            process.exit(1)
        }
    }
)
