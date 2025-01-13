import { Logger, Multimap, randomString, scheduleAtInterval, wait } from '@streamr/utils'
import { Contract, EventLog, Provider } from 'ethers'
import { sample } from 'lodash'

type EventName = string
type Listener = (...args: any[]) => void

const BLOCK_NUMBER_QUERY_RETRY_DELAY = 1000
export const POLLS_SINCE_LAST_FROM_BLOCK_UPDATE_THRESHOLD = 30

export class ChainEventPoller {
    private listeners: Multimap<EventName, Listener> = new Multimap()
    private abortController?: AbortController
    private contracts: Contract[]
    private pollInterval: number

    // all these contracts are actually the same chain contract (i.e. StreamRegistry), but have different providers
    // connected to them
    constructor(contracts: Contract[], pollInterval: number) {
        this.contracts = contracts
        this.pollInterval = pollInterval
    }

    on(eventName: string, listener: Listener): void {
        const started = !this.listeners.isEmpty()
        this.listeners.add(eventName, listener)
        if (!started) {
            this.start()
        }
    }

    off(eventName: string, listener: Listener): void {
        const started = !this.listeners.isEmpty()
        this.listeners.remove(eventName, listener)
        if (started && this.listeners.isEmpty()) {
            this.abortController!.abort()
        }
    }

    private start(): void {
        const abortController = new AbortController()
        this.abortController = abortController
        setImmediate(async () => {
            const logger = new Logger(module, { sessionId: randomString(6) })
            logger.debug('Start polling', { pollInterval: this.pollInterval })

            let fromBlock: number | undefined = undefined
            do {
                try {
                    fromBlock = await sample(this.getProviders())!.getBlockNumber()
                } catch (err) {
                    logger.debug('Failed to query block number', { err })
                    await wait(BLOCK_NUMBER_QUERY_RETRY_DELAY) // TODO: pass signal?
                }
            } while (fromBlock === undefined)

            let pollsSinceFromBlockUpdate = 0
            await scheduleAtInterval(
                async () => {
                    const contract = sample(this.contracts)!
                    const eventNames = [...this.listeners.keys()]
                    let newFromBlock = 0
                    let events: EventLog[] | undefined = undefined

                    try {
                        // If we haven't updated `fromBlock` for a while, fetch the latest block number explicitly. If
                        // `fromBlock` falls too much behind the current block number, the RPCs may start rejecting our
                        // eth_getLogs requests (presumably for performance reasons).
                        if (pollsSinceFromBlockUpdate >= POLLS_SINCE_LAST_FROM_BLOCK_UPDATE_THRESHOLD) {
                            newFromBlock = (await contract.runner!.provider!.getBlockNumber()) + 1
                            logger.debug('Fetch next block number explicitly', { newFromBlock })
                            if (abortController.signal.aborted) {
                                return
                            }
                        }

                        logger.debug('Polling', { fromBlock, eventNames })
                        events = (await contract.queryFilter([eventNames], fromBlock)) as EventLog[]
                        logger.debug('Polled', { fromBlock, events: events.length })
                    } catch (err) {
                        logger.debug('Failed to poll', { reason: err?.reason, eventNames, fromBlock })
                    }

                    if (abortController.signal.aborted) {
                        return
                    }

                    if (events !== undefined && events.length > 0) {
                        for (const event of events) {
                            const listeners = this.listeners.get(event.fragment.name)
                            for (const listener of listeners) {
                                listener(...event.args, event.blockNumber)
                            }
                        }
                        newFromBlock = Math.max(...events.map((e) => e.blockNumber)) + 1
                    }

                    // note: do not update fromBlock if polling events failed
                    if (events !== undefined && newFromBlock > fromBlock!) {
                        logger.debug('Forward fromBlock', { before: fromBlock, after: newFromBlock })
                        fromBlock = newFromBlock
                        // eslint-disable-next-line require-atomic-updates
                        pollsSinceFromBlockUpdate = 0
                    } else {
                        pollsSinceFromBlockUpdate += 1
                    }
                },
                this.pollInterval,
                true,
                abortController.signal
            )
        })
    }

    private getProviders(): Provider[] {
        return this.contracts.map((c) => c.runner!.provider!)
    }
}
