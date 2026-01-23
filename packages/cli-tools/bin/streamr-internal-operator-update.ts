#!/usr/bin/env node
import '../src/logLevel'

import { type EthereumAddress, StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { createClientCommand, Options as BaseOptions } from '../src/command'
import { createFnParseEthereumAddressList, createFnParseInt } from '../src/common'

interface Options extends BaseOptions {
    redundancyFactor?: number
    nodeAddresses?: EthereumAddress[]
}

createClientCommand(async (client: StreamrClient, operatorContractAddress: string, options: Options) => {
    if ((options.redundancyFactor === undefined) && (options.nodeAddresses === undefined)) {
        console.error('Nothing to update')
        process.exit(1)
    }
    const contract = _operatorContractUtils.getOperatorContract(operatorContractAddress).connect(await client.getSigner())
    if (options.redundancyFactor !== undefined) {
        const existingMetadata = JSON.parse(await contract.metadata())
        const metadata = {
            ...existingMetadata,
            redundancyFactor: options.redundancyFactor
        }
        await (await contract.updateMetadata(JSON.stringify(metadata))).wait()
    }
    if (options.nodeAddresses !== undefined) {
        await (await contract.setNodeAddresses(options.nodeAddresses)).wait()
    }
})
    .description('update operator')
    .arguments('<operatorContractAddress>')
    .option('-r, --redundancy-factor <number>', 'Redundancy factor',
        createFnParseInt('--redundancy-factor'))
    .option('-n, --node-addresses <addresses>', 'Node addresses (comma separated list of Ethereum addresses)', 
        createFnParseEthereumAddressList('nodeAddresses'))
    .parseAsync()
