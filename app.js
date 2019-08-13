#!/usr/bin/env node
const fs = require('fs')

const Sentry = require('@sentry/node')
const program = require('commander')

const CURRENT_VERSION = require('./package.json').version
const startBroker = require('./src/broker')

if (process.env.NODE_ENV === 'production') {
    Sentry.init({
        dsn: 'https://0fcf3b8f6b254caa9a7fadd77bcc37a4@sentry.io/1510389',
        integrations: [
            new Sentry.Integrations.Console({
                levels: ['error']
            })
        ],
        environment: 'broker',
        maxBreadcrumbs: 50,
        attachStacktrace: true,

    })
}

program
    .version(CURRENT_VERSION)
    .usage('<configFile>')
    .description('Run broker under environment specified by given configuration file.')
    .parse(process.argv)

if (program.args.length !== 1) {
    program.help()
}

const config = JSON.parse(fs.readFileSync(program.args[0]))
startBroker(config).catch((err) => {
    console.error(err)
    process.exit(1)
})
