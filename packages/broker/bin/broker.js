#!/usr/bin/env node
const fs = require('fs')

const program = require('commander')

const CURRENT_VERSION = require('../package.json').version
const { createBroker } = require('../dist/src/broker')
const { getDefaultFile } = require('../dist/src/config/config')

program
    .version(CURRENT_VERSION)
    .name('broker')
    .description('Run broker under environment specified by given configuration file.')
    .arguments('[configFile]')
    .option('--restUrl <url>', 'override restUrl with given value')
    .option('--networkId <id>', 'override networkId with given value')
    .option('--test', 'test the configuration (does not start the broker)')
    .action(async (configFile) => {
        if (configFile == null) {
            configFile = getDefaultFile()
            if (!fs.existsSync(configFile)) {
                // eslint-disable-next-line max-len
                console.error(`Config file not found in the default location "${configFile}". You can run "streamr-broker-init" to generate a config file interactively, or specify the config file as argument: "streamr-broker path-to-config/file.json"`)
                process.exit(1)
            }
        }
        let config = JSON.parse(fs.readFileSync(configFile, 'utf8'))
        if (program.opts().restUrl) {
            config.client.restUrl = program.opts().restUrl
        }
        if (program.opts().networkId) {
            config.network.id = program.opts().networkId
        }

        try {
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
