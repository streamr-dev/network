#!/usr/bin/env node
import { program } from 'commander'
import pkg from '../package.json'
import { start } from '../src/config/ConfigWizard'

program.version(pkg.version).name('streamr-node-init').description('Run the configuration wizard for the Streamr node.')
;(async () => {
    try {
        await start()
    } catch (e) {
        console.error('Streamr Node Config Wizard encountered an error:\n', e)
    }
})()
