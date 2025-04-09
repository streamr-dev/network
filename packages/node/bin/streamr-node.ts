#!/usr/bin/env node
import { program } from 'commander'
import pkg from '../package.json'

import { createBroker } from '../src/broker'
import { readConfigAndMigrateIfNeeded } from '../src/config/migration'
import { overrideConfigToEnvVarsIfGiven } from '../src/config/config'

program
    .version(pkg.version)
    .name('streamr-node')
    .description('Run a Streamr node in the environment specified by given configuration file.')
    .arguments('[configFile]')
    .option('--test', 'test the configuration (does not start the node)')
    .action(async (configFile) => {
        try {
            const config = readConfigAndMigrateIfNeeded(configFile)
            overrideConfigToEnvVarsIfGiven(config)
            const broker = await createBroker(config)
            if (!program.opts().test) {
                await broker.start()
            } else {
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
