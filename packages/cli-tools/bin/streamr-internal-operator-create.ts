#!/usr/bin/env node
import '../src/logLevel'

import { EthereumAddress, StreamrClient, _operatorContractUtils } from '@streamr/sdk'
import { createClientCommand, Options as BaseOptions } from '../src/command'
import { createFnParseEthereumAddressList } from '../src/common'

interface Options extends BaseOptions {
    cut: number
    redundancyFactor?: number
    nodeAddresses?: EthereumAddress[]
}

createClientCommand(async (client: StreamrClient, options: Options) => {
    if (client.getConfig().environment !== 'dev2') {
        // currently the deployOperatorContract uses TEST_CHAIN_CONFIG and therefore only "dev2" is supported
        // TODO add e.g. "environment" parameter to that function so that other environments are also supported 
        console.error('only "dev2" environment is supported')
        process.exit(1)
    }
    const metadata = (options.redundancyFactor !== undefined) ? JSON.stringify({ redundancyFactor: options.redundancyFactor }) : ''
    const contract = await _operatorContractUtils.deployOperatorContract({
        deployer: await client.getSigner(),
        // TODO maybe we could change the operatorsCutPercentage type in _operatorContractUtils.deployOperatorContract so that the percentages
        // aren't affected by floating point numbers (now e.g. input 12.3 stores the value as 12.3000000000000016)
        operatorsCutPercentage: options.cut,
        metadata
    })
    if (options.nodeAddresses !== undefined) {
        await (await contract.setNodeAddresses(options.nodeAddresses)).wait()
    }
    console.info(JSON.stringify({ address: await contract.getAddress() }, undefined, 4))
})
    .description('create operator')
    .requiredOption('-c, --cut <number>', 'Operator\'s cut in percentage')
    .option('-r, --redundancyFactor <number>', 'Redundancy factor')
    .option('-n, --nodeAddresses <addresses>', 'Node addresses (comma separated list of Ethereum addresses)', 
        createFnParseEthereumAddressList('nodeAddresses'))
    .parseAsync()
