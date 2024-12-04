import { EthereumAddress, Logger, randomString, scheduleAtInterval, toEthereumAddress, wait } from '@streamr/utils'
import { AbstractProvider, EventFragment, Interface } from 'ethers'
import { remove, sample, uniq } from 'lodash'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { ConfigInjectionToken, StrictStreamrClientConfig } from '../Config'
import { RpcProviderSource } from '../RpcProviderSource'

export interface EventListenerDefinition {
    onEvent: (...args: any[]) => void
    contractInterfaceFragment: EventFragment
    contractAddress: EthereumAddress
}

const BLOCK_NUMBER_QUERY_RETRY_DELAY = 1000
export const POLLS_SINCE_LAST_FROM_BLOCK_UPDATE_THRESHOLD = 30

@scoped(Lifecycle.ContainerScoped)
export class ChainEventPoller {

    private listeners: EventListenerDefinition[] = []
    private providers: AbstractProvider[]
    private pollInterval: number
    private abortController?: AbortController

    constructor(
        rpcProviderSource: RpcProviderSource,
        @inject(ConfigInjectionToken) config: Pick<StrictStreamrClientConfig, 'contracts'>
    ) {
        this.providers = rpcProviderSource.getSubProviders()
        this.pollInterval = config.contracts.pollInterval
    }

    on(definition: EventListenerDefinition): void {
        const started = this.listeners.length > 0
        this.listeners.push(definition)
        if (!started) {
            this.start()
        }
    }

    off(definition: EventListenerDefinition): void {
        const started = this.listeners.length > 0
        remove(this.listeners, (l) => {
            return (l.contractAddress === definition.contractAddress)
                && (l.contractInterfaceFragment.topicHash === definition.contractInterfaceFragment.topicHash)
                && (l.onEvent == definition.onEvent)
        })
        if (started && this.listeners.length === 0) {
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
                    fromBlock = await sample(this.providers)!.getBlockNumber()
                } catch (err) {
                    logger.debug('Failed to query block number', { err })
                    await wait(BLOCK_NUMBER_QUERY_RETRY_DELAY) // TODO: pass signal?
                }
            } while (fromBlock === undefined)

            let pollsSinceFromBlockUpdate = 0
            await scheduleAtInterval(async () => {
                const provider = sample(this.providers)!
                const eventNames = this.listeners.map((l) => l.contractInterfaceFragment.name)
                let newFromBlock = 0
                let events: { contractAddress: EthereumAddress, name: string, args: any[], blockNumber: number }[] | undefined = undefined

                try {
                    // If we haven't updated `fromBlock` for a while, fetch the latest block number explicitly. If
                    // `fromBlock` falls too much behind the current block number, the RPCs may start rejecting our
                    // eth_getLogs requests (presumably for performance reasons).
                    if (pollsSinceFromBlockUpdate >= POLLS_SINCE_LAST_FROM_BLOCK_UPDATE_THRESHOLD) {
                        newFromBlock = await provider.getBlockNumber() + 1
                        logger.debug('Fetch next block number explicitly', { newFromBlock } )
                        if (abortController.signal.aborted) {
                            return
                        }
                    }
                    logger.debug('Polling', { fromBlock, eventNames })
                    const filter = {
                        address: uniq(this.listeners.map((l) => l.contractAddress)),
                        topics: [uniq(this.listeners.map((l) => l.contractInterfaceFragment.topicHash))],
                        fromBlock
                    }
                    const logItems = await provider.getLogs(filter)
                    events = []
                    for (const logItem of logItems) {
                        const definition = this.listeners.find((l) => {
                            return (l.contractAddress === toEthereumAddress(logItem.address))
                                && (l.contractInterfaceFragment.topicHash === logItem.topics[0])
                        })
                        if (definition !== undefined) {
                            const contractInterface = new Interface([definition.contractInterfaceFragment.format('minimal')])
                            const args = contractInterface.decodeEventLog(definition.contractInterfaceFragment.name, logItem.data, logItem.topics)
                            events.push({
                                contractAddress: definition.contractAddress,
                                name: definition.contractInterfaceFragment.name,
                                args,
                                blockNumber: logItem.blockNumber
                            })
                        }
                    }
                    logger.debug('Polled', { fromBlock, events: events.length })
                } catch (err) {
                    logger.debug('Failed to poll', { reason: err?.reason, eventNames, fromBlock })
                }

                if (abortController.signal.aborted) {
                    return
                }

                if (events !== undefined && events.length > 0) {
                    for (const event of events) {
                        const listeners = this.listeners.filter(
                            (l) => (l.contractAddress === event.contractAddress) && (l.contractInterfaceFragment.name === event.name)
                        )
                        for (const listener of listeners) {
                            listener.onEvent(...event.args, event.blockNumber)
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

            }, this.pollInterval, true, abortController.signal)
        })
    }
}
