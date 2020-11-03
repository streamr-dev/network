#!/usr/bin/env node
const fs = require('fs')

const program = require('commander')

const CURRENT_VERSION = require('../package.json').version
const startBroker = require('../src/broker')

program
    .version(CURRENT_VERSION)
    .name('broker')
    .description('Run broker under environment specified by given configuration file.')
    .arguments('<configFile>')
    .option('--streamrUrl <url>', 'override streamrUrl with given value')
    .option('--networkId <id>', 'override networkId with given value')
    .action(async (configFile) => {
        const config = JSON.parse(fs.readFileSync(configFile, 'utf8'))

        if (program.streamrUrl) {
            config.streamrUrl = program.streamrUrl
        }
        if (program.networkId) {
            config.network.id = program.networkId
        }

        await startBroker(config, true).catch((err) => {
            console.error(err)
            process.exit(1)
        })
    })
    .parse(process.argv)
