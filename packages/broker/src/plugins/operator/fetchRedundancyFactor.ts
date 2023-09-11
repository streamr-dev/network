import { Logger } from '@streamr/utils'
import { Contract } from 'ethers'
import { Operator, operatorABI } from '@streamr/network-contracts'
import { OperatorServiceConfig } from './OperatorPlugin'
import { z } from 'zod'

const logger = new Logger(module)

const MetadataSchema = z.object({
    redundancyFactor: z.number()
        .int()
        .gte(1)
})

export async function fetchRedundancyFactor({
    operatorContractAddress,
    signer
}: Pick<OperatorServiceConfig, 'operatorContractAddress' | 'signer'>): Promise<number | undefined> {
    const operator = new Contract(operatorContractAddress, operatorABI, signer) as unknown as Operator
    const metadataAsString = await operator.metadata()

    if (metadataAsString.length === 0) {
        return 1
    }

    let metadata: Record<string, unknown>
    try {
        metadata = JSON.parse(metadataAsString)
    } catch {
        logger.warn('Encountered malformed metadata', { operatorContractAddress, metadataAsString })
        return undefined
    }

    let validatedMetadata: z.infer<typeof MetadataSchema>
    try {
        validatedMetadata = MetadataSchema.parse(metadata)
    } catch (err) {
        logger.warn('Encountered invalid metadata', {
            operatorContractAddress,
            metadataAsString,
            reason: err?.reason
        })
        return undefined
    }
    return validatedMetadata.redundancyFactor
}
