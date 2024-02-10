#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-floating-promises */
import { program } from 'commander'
import pkg from '../package.json'
import { start } from '../src/config/ConfigWizard'

program
    .version(pkg.version)
    .name('broker-config-wizard')
    .description('Run the configuration wizard for the broker')

;(async () => {
    try {
        await start()
    } catch (e) {
        console.error('Streamr Node Config Wizard encountered an error:\n', e)
    }
})()
