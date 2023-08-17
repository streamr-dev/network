import { Contract } from 'ethers'
import { Operator, operatorABI } from '@streamr/network-contracts'
import { OperatorServiceConfig } from './OperatorPlugin'
import { NetworkPeerDescriptor } from 'streamr-client'
import { Logger, TheGraphClient } from '@streamr/utils'
import fetch from 'node-fetch'

const logger = new Logger(module)

interface RawResult {
    operator: null | { latestHeartbeatTimestamp: string | null }
}

export class AnnounceNodeToContractHelper {
    private readonly operator: Operator
    private readonly theGraphClient: TheGraphClient

    constructor(config: OperatorServiceConfig) {
        this.operator = (new Contract(config.operatorContractAddress, operatorABI, config.signer) as unknown as Operator)
            .connect(config.signer)
        this.theGraphClient = new TheGraphClient({
            serverUrl: config.theGraphUrl,
            fetch,
            logger
        })
    }

    async writeHeartbeat(nodeDescriptor: NetworkPeerDescriptor): Promise<void> {
        const metadata = JSON.stringify(nodeDescriptor)
        await (await this.operator.heartbeat(metadata)).wait()
    }

    async getTimestampOfLastHeartbeat(): Promise<number | undefined> {
        const result = await this.theGraphClient.queryEntity<RawResult>({
            query: `{
                operator(id: "${this.operator.address}") {
                    latestHeartbeatTimestamp
                }
            }`
        })
        if (result.operator === null || result.operator.latestHeartbeatTimestamp === null) {
            return undefined
        } else {
            const timestampInSecs = parseInt(result.operator.latestHeartbeatTimestamp)
            if (isNaN(timestampInSecs)) {
                throw new Error('Assertion failed: unexpected non-integer latestHeartbeatTimestamp') // should never happen
            }
            return timestampInSecs * 1000
        }
    }

    getOperatorContractAddress(): string {
        return this.operator.address
    }
}
