#!/usr/bin/env node
const fs = require('fs')

const program = require('commander')

const CURRENT_VERSION = require('../package.json').version
const startBroker = require('../dist/src/broker')

program
    .version(CURRENT_VERSION)
    .name('broker')
    .description('Run broker under environment specified by given configuration file.')
    .arguments('<configFile>')
    .option('--streamrUrl <url>', 'override streamrUrl with given value')
    .option('--streamrAddress <address>', 'override streamrAddress with given value')
    .option('--networkId <id>', 'override networkId with given value')
    .action(async (configFile) => {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))

        if (program.opts().streamrUrl) {
            config.streamrUrl = program.opts().streamrUrl
        }
        if (program.opts().streamrAddress) {
            config.streamrAddress = program.opts().streamrAddress
        }
        if (program.opts().networkId) {
            config.network.id = program.opts().networkId
        }

        await startBroker(config, true).catch((err) => {
            console.error(err)
            process.exit(1)
        })
    })
    .parse(process.argv)
