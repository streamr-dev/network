#!/usr/bin/env node
const program = require('commander')

const CURRENT_VERSION = require('../package.json').version
const { createBroker } = require('../dist/src/broker')
const { readConfigAndMigrateIfNeeded } = require('../dist/src/config/migration')

program
    .version(CURRENT_VERSION)
    .name('broker')
    .description('Run broker under environment specified by given configuration file.')
    .arguments('[configFile]')
    .option('--networkId <id>', 'override networkId with given value')
    .option('--test', 'test the configuration (does not start the broker)')
    .action(async (configFile) => {
        try {
            const config = readConfigAndMigrateIfNeeded(configFile)
            if (program.opts().networkId) {
                config.network.id = program.opts().networkId
            }

            const broker = await createBroker(config, true)
            if (!program.opts().test) {
                await broker.start()
            } else {
                // eslint-disable-next-line no-console
                console.info('the configuration is valid')
                // TODO remove process.exit(0)
                // We should not need explicit exit call if all setTimeouts are cleared.
                // Currently there is only one leaking timeout in PingPongWs (created
                // by NodeClientWsEndpoint from the createNetworkNode() call)
                process.exit(0)
            }
        } catch (err) {
            console.error(err)
            process.exit(1)
        }
    })
    .parse(process.argv)
