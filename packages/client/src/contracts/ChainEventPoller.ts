import { Logger, Multimap, randomString, wait, withTimeout } from '@streamr/utils'
import { Contract, EventLog, Provider } from 'ethers'
import { sample } from 'lodash'

type EventName = string
type Listener = (...args: any[]) => void

const BLOCK_NUMBER_QUERY_DELAY = 1000
const POLL_INTERVAL = 1000  // TODO 5000? create a config option?
const TIMEOUT = 10 * 1000 // TODO what would be a good value? create a config option?
// This is a undocumented ether.js feature. We could alternatively pass [...this.listeners.keys()], but
// that doesn't seem to work if array size > 1
const ALL_TOPICS = '*'

export class ChainEventPoller {

    private listeners: Multimap<EventName, Listener> = new Multimap()
    private contracts: Contract[]
    private abortSignal: AbortSignal = new AbortController().signal // TODO get an instance from constructor

    // all these contracts are actually the same chain contract (i.e. StreamRegistry), but have different providers
    // connected to them
    constructor(contracts: Contract[]) {
        this.contracts = contracts
    }

    on(eventName: string, listener: Listener): void {
        const started = this.listeners.getKeyCount() > 0
        this.listeners.add(eventName, listener)
        if (!started) {
            this.start()
        }
    }

    off(eventName: string, listener: Listener): void {
        this.listeners.remove(eventName, listener)
        // const started = [this.listeners.keys()].length > 0  // TODO implement this as "getKeyCount" method to Multimap
        // TODO stop if no listeners
    }

    private start(): void {
        setImmediate(async () => {
            const logger = new Logger(module, { traceId: randomString(6) })
            logger.info('Start polling', { POLL_INTERVAL })  // TODO debug level
            let fromBlock = undefined
            do {
                try {
                    fromBlock = await sample(this.getProviders())!.getBlockNumber()
                } catch (err) {
                    logger.info('Failed to query block number', { err })  // TODO debug level
                    await wait(BLOCK_NUMBER_QUERY_DELAY)
                }
            } while (fromBlock === undefined)
            while (!this.abortSignal.aborted) {
                const eventNames = [...this.listeners.keys()]
                logger.info('Polling', { fromBlock, eventNames })  // TODO debug level
                try {
                    const events = (await withTimeout(
                        sample(this.contracts)!.queryFilter(ALL_TOPICS, fromBlock),
                        TIMEOUT,
                        undefined,
                        this.abortSignal
                    )) as EventLog[]
                    logger.info('Polled', { fromBlock, events: events.length })  // TODO debug level
                    if (events.length > 0) {
                        for (const event of events) {
                            const listeners = this.listeners.get(event.fragment.name)
                            for (const listener of listeners) {
                                listener(...event.args, event.blockNumber)
                            }
                        }
                        fromBlock = events[0].blockNumber + 1
                    }
                } catch (err) {
                    logger.info('Failed to poll', { err, eventNames, fromBlock })  // TODO debug level
                }
                await wait(POLL_INTERVAL, this.abortSignal)
            }
        })
    }

    private getProviders(): Provider[] {
        return this.contracts.map((c) => c.runner!.provider!)
    }
}
