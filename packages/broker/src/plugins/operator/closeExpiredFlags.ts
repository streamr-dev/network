import { Logger } from '@streamr/utils'
import { Sponsorship, sponsorshipABI } from '@streamr/network-contracts'
import { Contract } from '@ethersproject/contracts'
import { randomBytes } from '@ethersproject/random'
import { ContractFacade } from './ContractFacade'
import { OperatorServiceConfig } from './OperatorPlugin'

const logger = new Logger(module)

// const { ENV, PRIVKEY, INTERVALSEC } = process.env

// let graphClient: TheGraphClient
// let provider: JsonRpcProvider
// let signer: Signer
// const flagLifetime = 60 * 75 // 75 minutes

// if (ENV === 'test') {
//     graphClient = new TheGraphClient({
//         serverUrl: config.dev2.theGraphUrl,
//         fetch,
//         logger: new Logger(module)
//     })
//     provider = new JsonRpcProvider(config.dev2.rpcEndpoints[0].url)
//     signer = new Wallet("0x5e98cce00cff5dea6b454889f359a4ec06b9fa6b88e9d69b86de8e1c81887da0")
//         .connect(provider)
// } else {
//     graphClient = new TheGraphClient({
//         serverUrl: config.mumbai.theGraphUrl,
//         fetch,
//         logger: new Logger(module)
//     })
//     provider = new JsonRpcProvider(config.mumbai.rpcEndpoints[0].url)
//     signer = new Wallet(PRIVKEY || "", provider).connect(provider)
// }

export const closeExpiredFlags = async (
    flagLifetime: number,
    serviceConfig: OperatorServiceConfig,
    contractFacade: ContractFacade
): Promise<void> => {

    // async function checkForFlags() {

    const minFlagStartTime = Math.floor(Date.now() / 1000) - flagLifetime
    // logger.info('min flag start time', minFlagStartTime)
    // const minFlagStartTime = Math.floor(Date.now() / 1000)
    let flags: any
    try {
        flags = await contractFacade.theGraphClient.queryEntity<any>({ query: `
        {
            flags(where: {flaggingTimestamp_lt: ${minFlagStartTime}, result_not_in: ["kicked", "failed"]}) {
                id
                flaggingTimestamp
                sponsorship {
                    id
                }
                target {
                    id
                }
            }
        }`
        })
    } catch (e) {
        logger.warn('failed to query flags', e)
        return
    }
    logger.info(`found ${flags.flags.length} flags`)
    for (const flag of flags.flags) {
        const flagId = flag.id
        const operatorAddress = flag.target.id
        const sponsorship = flag.sponsorship.id
        const sponsorshipContract = new Contract(sponsorship, sponsorshipABI, serviceConfig.signer) as unknown as Sponsorship
        // logger.info('flag timestamp', flag.flaggingTimestamp, 'min flag age', minFlagStartTime)
        if (flag.flaggingTimestamp < minFlagStartTime) {
            await closeFlag(flagId, sponsorshipContract, operatorAddress)
        }
    }
}

// async function main() {
//     await checkForFlags()
//     setInterval(checkForFlags, parseInt(INTERVALSEC || "900") * 1000) // default 15 minutes
// }

// main().catch(console.error)

const closeFlag = async (flagID: string, sponsorshipContract: Sponsorship, operatorAddress: string) => {
    try {
        logger.info(`flag id: ${flagID}, sending close flag tx`)
        const tx = await sponsorshipContract.voteOnFlag(operatorAddress, randomBytes(32))
        logger.info(`flag id: ${flagID}, sent tx, tx hash: ${tx.hash}`)
        const receipt = await tx.wait()
        logger.info(`flag id: ${flagID}, tx mined ${receipt.transactionHash}`)
    } catch (e) {
        logger.info(`flag id: ${flagID}, failed to send tx ${e}`)
    }
}
