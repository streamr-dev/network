import { Logger } from '@streamr/utils'
import { Contract } from 'ethers'
import { Operator, operatorABI } from '@streamr/network-contracts'
import { OperatorServiceConfig } from './OperatorPlugin'

const logger = new Logger(module)

export async function fetchRedundancyFactor({
    operatorContractAddress,
    nodeWallet
}: Pick<OperatorServiceConfig, 'operatorContractAddress' | 'nodeWallet'>): Promise<number> {
    const operator = new Contract(operatorContractAddress, operatorABI, nodeWallet) as unknown as Operator
    const metadataAsString = await operator.metadata()
    let metadata: Record<string, unknown> = {}
    if (metadataAsString.length > 0) {
        try {
            metadata = JSON.parse(metadataAsString)
        } catch (e) {
            logger.warn('Encountered malformed metadata', { operatorContractAddress, metadataAsString })
        }
    }
    const redundancyFactor = Number(metadata.redundancyFactor)
    return !isNaN(redundancyFactor) ? Math.max(redundancyFactor, 1) : 1
}
