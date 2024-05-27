import { Logger, randomString, wait } from '@streamr/utils'
import { AbstractProvider, Contract } from 'ethers'

interface PollEventParams {
    contract: Contract
    eventName: string
    provider: AbstractProvider
    pollIntervalInMs: number
    abortSignal: AbortSignal
    onEvent: (event: any) => void
}

// TODO: first implementation, iron out bugs & think about final form
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function pollEvent({
    contract,
    eventName,
    provider,
    pollIntervalInMs,
    abortSignal,
    onEvent
}: PollEventParams): Promise<void> {
    let fromBlock = await provider.getBlockNumber() - 100
    const logger = new Logger(module, { traceId: randomString(6) })
    logger.debug('Start polling', { eventName, fromBlock, pollIntervalInMs })
    while (!abortSignal.aborted) {
        logger.debug('Polling', { fromBlock })
        const events = await contract.queryFilter(eventName, fromBlock)
        logger.debug('Polled', { fromBlock, events: events.length })
        for (const event of events) {
            onEvent(event)
            fromBlock = event.blockNumber + 1
        }
        await wait(pollIntervalInMs, abortSignal)
    }
}
