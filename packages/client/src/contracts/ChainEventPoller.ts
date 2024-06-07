import { Logger, Multimap, randomString, wait, withTimeout, scheduleAtInterval } from '@streamr/utils'
import { Contract, EventLog, Provider } from 'ethers'
import { sample } from 'lodash'

type EventName = string
type Listener = (...args: any[]) => void

const BLOCK_NUMBER_QUERY_RETRY_DELAY = 1000

export class ChainEventPoller {

    private listeners: Multimap<EventName, Listener> = new Multimap()
    private abortController?: AbortController
    private contracts: Contract[]
    private pollInterval: number
    private timeout: number

    // all these contracts are actually the same chain contract (i.e. StreamRegistry), but have different providers
    // connected to them
    constructor(contracts: Contract[], pollInterval: number, timeout: number) {
        this.contracts = contracts
        this.pollInterval = pollInterval
        this.timeout = timeout
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
                    await wait(BLOCK_NUMBER_QUERY_RETRY_DELAY)
                }
            } while (fromBlock === undefined)
            await scheduleAtInterval(async () => {
                const eventNames = [...this.listeners.keys()]
                logger.debug('Polling', { fromBlock, eventNames })
                try {
                    const events = (await withTimeout(
                        sample(this.contracts)!.queryFilter([eventNames], fromBlock),
                        this.timeout,
                        undefined,
                        this.abortController!.signal
                    )) as EventLog[]
                    logger.debug('Polled', { fromBlock, events: events.length })
                    if ((events.length > 0) && (!abortController.signal.aborted)) {
                        for (const event of events) {
                            const listeners = this.listeners.get(event.fragment.name)
                            for (const listener of listeners) {
                                listener(...event.args, event.blockNumber)
                            }
                        }
                        fromBlock = events[0].blockNumber + 1
                    }
                } catch (err) {
                    logger.debug('Failed to poll', { err, eventNames, fromBlock })
                }

            }, this.pollInterval, true, abortController.signal)
        })
    }

    private getProviders(): Provider[] {
        return this.contracts.map((c) => c.runner!.provider!)
    }
}
