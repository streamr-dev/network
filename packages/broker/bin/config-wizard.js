#!/usr/bin/env node

const startBrokerConfigWizard = require('../dist/src/ConfigWizard').startBrokerConfigWizard

const program = require('commander')

const CURRENT_VERSION = require('../package.json').version

program
    .version(CURRENT_VERSION)
    .name('broker-config-wizard')
    .description('Run the configuration wizard for the broker')
    .action(async () => {
        console.log('action reached')

    })
startBrokerConfigWizard('../../configs/')
