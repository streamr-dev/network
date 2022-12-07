#!/usr/bin/env node
import { program } from 'commander'
import pkg from '../package.json'
import { start } from '../src/config/ConfigWizard'

program
    .version(pkg.version)
    .name('broker-config-wizard')
    .description('Run the configuration wizard for the broker')

start()
