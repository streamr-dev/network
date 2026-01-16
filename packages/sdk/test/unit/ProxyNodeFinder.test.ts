import 'reflect-metadata'
import { ProxyNodeFinder } from '../../src/ProxyNodeFinder'
import { StreamIDBuilder } from '../../src/StreamIDBuilder'
import { OperatorRegistry, FindOperatorsOnStreamResult } from '../../src/contracts/OperatorRegistry'
import { NetworkNodeFacade } from '../../src/NetworkNodeFacade'
import { LoggerFactory } from '../../src/utils/LoggerFactory'
import { mock, MockProxy } from 'jest-mock-extended'
import { toStreamID, toStreamPartID, Logger } from '@streamr/utils'
import type { NetworkPeerDescriptor } from '../../src/ConfigTypes'

describe('ProxyNodeFinder', () => {

    let proxyNodeFinder: ProxyNodeFinder
    let streamIdBuilder: MockProxy<StreamIDBuilder>
    let operatorRegistry: MockProxy<OperatorRegistry>
    let node: MockProxy<NetworkNodeFacade>
    let loggerFactory: MockProxy<LoggerFactory>
    let logger: MockProxy<Logger>

    const streamId = toStreamID('streamId')
    const partition = 0
    const streamPartId = toStreamPartID(streamId, partition)
    const streamDefinition = 'streamId'

    beforeEach(() => {
        streamIdBuilder = mock<StreamIDBuilder>()
        operatorRegistry = mock<OperatorRegistry>()
        node = mock<NetworkNodeFacade>()
        loggerFactory = mock<LoggerFactory>()
        logger = mock<Logger>()
        loggerFactory.createLogger.mockReturnValue(logger)

        streamIdBuilder.toStreamPartElements.mockResolvedValue([streamId, partition])
        
        proxyNodeFinder = new ProxyNodeFinder(
            streamIdBuilder,
            operatorRegistry,
            node,
            loggerFactory
        )
    })

    const createOperator = (id: string): FindOperatorsOnStreamResult => ({
        operatorId: id as any,
        peerDescriptor: { nodeId: id }
    })

    const createNode = (id: string): NetworkPeerDescriptor => ({
        nodeId: id
    })

    it('finds proxies successfully', async () => {
        const op1 = createOperator('op1')
        operatorRegistry.findOperatorsOnStream.mockResolvedValue([op1])
        const node1 = createNode('node1')
        node.discoverOperators.mockResolvedValue([node1])

        const result = await proxyNodeFinder.find(streamDefinition, 1)
        expect(result).toEqual([node1])
        expect(operatorRegistry.findOperatorsOnStream).toHaveBeenCalledWith(streamId, 100, 24)
        expect(node.discoverOperators).toHaveBeenCalledWith(op1.peerDescriptor, streamPartId)
    })

    it('throws if not enough operators found', async () => {
        operatorRegistry.findOperatorsOnStream.mockResolvedValue([])
        await expect(proxyNodeFinder.find(streamDefinition, 1))
            .rejects
            .toThrow('Not enough operators found')
    })

    it('throws if not enough proxies found after discovery', async () => {
        const op1 = createOperator('op1')
        operatorRegistry.findOperatorsOnStream.mockResolvedValue([op1])
        node.discoverOperators.mockResolvedValue([])

        await expect(proxyNodeFinder.find(streamDefinition, 1))
            .rejects
            .toThrow('Not enough proxy nodes were resolved')
    })

    it('skips operators that throw error', async () => {
        const op1 = createOperator('op1')
        const op2 = createOperator('op2')
        operatorRegistry.findOperatorsOnStream.mockResolvedValue([op1, op2])
        
        node.discoverOperators.calledWith(op1.peerDescriptor, streamPartId).mockRejectedValue(new Error('mock-error'))
        const node2 = createNode('node2')
        node.discoverOperators.calledWith(op2.peerDescriptor, streamPartId).mockResolvedValue([node2])

        const result = await proxyNodeFinder.find(streamDefinition, 1)
        expect(result).toEqual([node2])
        // We can't strictly assert logger.error was called because shuffle might cause op2 (success) to be tried first
        // avoiding op1 (error) entirely. But we know it succeeded.
    })

    it('logs error if operator discovery fails', async () => {
        const op1 = createOperator('op1')
        operatorRegistry.findOperatorsOnStream.mockResolvedValue([op1])
        node.discoverOperators.calledWith(op1.peerDescriptor, streamPartId).mockRejectedValue(new Error('mock-error'))

        await expect(proxyNodeFinder.find(streamDefinition, 1))
            .rejects
            .toThrow('Not enough proxy nodes were resolved')
        
        expect(logger.error).toHaveBeenCalled()
    })
})

