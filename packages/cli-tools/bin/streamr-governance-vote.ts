#!/usr/bin/env node
import pkg from '../package.json'
import { createCommand } from '../src/command'
import { getClientConfig } from '../src/client'
import snapshot from '@snapshot-labs/snapshot.js'
import { Wallet } from '@ethersproject/wallet'

const hub = 'https://hub.snapshot.org'
const snapshotClient = new snapshot.Client712(hub)

const vote = async (privateKey: string, proposal: string, choice: number) => {
    const wallet = new Wallet(privateKey)
    try {
        await snapshotClient.vote(wallet, wallet.address, {
            space: 'streamr.eth',
            proposal,
            type: 'single-choice', // support only this type for now
            choice,
            app: 'cli-tool'
        })
        console.log(`Successfully voted for choice ${choice} on proposal ${proposal}`)
    } catch (err) {
        console.error(err)
    }
}

// The StreamrClient is not really used here, but we want to support the same
// --private-key and --config args as the commands that actually use the client
createCommand()
    .description('vote on a Streamr governance proposal')
    .arguments('<proposalId> <choiceId>')
    .option('--private-key <key>', 'use an Ethereum private key to authenticate')
    .option('--config <file>', 'read connection and authentication settings from a config file')
    .action(async (proposalId: string, choiceId: string, options, command) => {
        const config = getClientConfig(options)
        if (!config.auth || !config.auth.privateKey) {
            console.error('You must pass a private key either via --private-key or via a config file using --config')
            command.help()
        } else {
            await vote(config.auth.privateKey, proposalId, parseInt(choiceId))
        }
    })
    .version(pkg.version)
    .parseAsync()
