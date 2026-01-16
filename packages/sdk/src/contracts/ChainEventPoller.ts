import { EthereumAddress, Logger, randomString, scheduleAtInterval, toEthereumAddress, wait } from '@streamr/utils'
import { AbstractProvider, EventFragment, Interface } from 'ethers'
import remove from 'lodash/remove'
import sample from 'lodash/sample'
import uniq from 'lodash/uniq'
import { inject, Lifecycle, scoped } from 'tsyringe'
import { ConfigInjectionToken, type StrictStreamrClientConfig } from '../ConfigTypes'
import { RpcProviderSource } from '../RpcProviderSource'

export interface EventListenerDefinition<TEventArgs extends any[]> {
    onEvent: (eventArgs: TEventArgs, blockNumber: number) => void
    contractInterfaceFragment: EventFragment
    contractAddress: EthereumAddress
}

const BLOCK_NUMBER_QUERY_RETRY_DELAY = 1000
export const POLLS_SINCE_LAST_FROM_BLOCK_UPDATE_THRESHOLD = 30

@scoped(Lifecycle.ContainerScoped)
export class ChainEventPoller {

    private listeners: EventListenerDefinition<any[]>[] = []
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

    on<TEventArgs extends any[]>(definition: EventListenerDefinition<TEventArgs>): void {
        const started = this.listeners.length > 0
        this.listeners.push(definition as EventListenerDefinition<any[]>)
        if (!started) {
            this.start()
        }
    }

    off<TEventArgs extends any[]>(definition: EventListenerDefinition<TEventArgs>): void {
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
            const logger = new Logger('ChainEventPoller', { sessionId: randomString(6) })
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
                    // This creates a filter with the following criteria: 
                    // - logs must originate from any of the specified addresses: [address1, address2] (OR condition)
                    // - logs must match any of the specified topics: [[topic1, topic2, topic3]] (OR condition for topic[0])
                    // - logs must be within the specified fromBlock range
                    //
                    // In the topics filter:
                    // - the inner array ([topic1, topic2, topic3]) applies an OR condition, meaning the log’s first topic can be any of these
                    // - the outer array ([[topic1, topic2, topic3]]) applies an AND condition across topic positions (i.e. only one AND expression)
                    //   See: https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_newfilter
                    //
                    // Ideally, we would specify exact address-topic pairs, such as:
                    //   (addr=111 AND topic=222) OR (addr=333 AND topic=444)
                    // However, Ethereum's API does not support this level of filtering.
                    //
                    // As a result, this filter may return additional logs beyond the intended matches. 
                    // For example, if we want:
                    //   - Topic T1 from addresses A1 and A2
                    //   - Topic T2 from address A3
                    // We might also receive:
                    //   - T2 from A1 or A2
                    //   - T1 from A3
                    // These extra events are safely ignored, as the event propagation logic (see line 148) ensures that
                    // only relevant listeners process them.
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
                            listener.onEvent(event.args, event.blockNumber)
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
