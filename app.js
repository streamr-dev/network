#!/usr/bin/env node
const fs = require('fs')

const program = require('commander')

const CURRENT_VERSION = require('./package.json').version
const startBroker = require('./src/broker')
const DeleteExpiredCmd = require('./src/new-storage/DeleteExpiredCmd')

program
    .version(CURRENT_VERSION)
    .name('broker')
    .description('Run broker under environment specified by given configuration file.')
    .arguments('<configFile>')
    .option('--deleteExpired', 'remove expired data from storage', false)
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

        if (program.deleteExpired === true) {
            console.info('Starting removing expired data from database')
            const cmd = new DeleteExpiredCmd(config)
            await cmd.run()
            return
        }

        await startBroker(config, true).catch((err) => {
            console.error(err)
            process.exit(1)
        })
    })
    .parse(process.argv)
