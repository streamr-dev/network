import { mock, MockProxy } from 'jest-mock-extended'
import { NetworkPeerDescriptor, NodeID, StreamrClient, Subscription } from 'streamr-client'
import { StreamID, StreamPartID, toStreamID, toStreamPartID } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { findNodesForTarget, findTarget, inspectTarget } from '../../../../src/plugins/operator/inspectionUtils'
import { StreamPartAssignments } from '../../../../src/plugins/operator/StreamPartAssignments'
import { EthereumAddress, Logger, wait } from '@streamr/utils'
import { OperatorFleetState } from '../../../../src/plugins/operator/OperatorFleetState'
import { ContractFacade } from '../../../../src/plugins/operator/ContractFacade'

const MY_OPERATOR_ADDRESS = randomEthereumAddress()
const OTHER_OPERATOR_ADDRESS = randomEthereumAddress()
const SPONSORSHIP_ADDRESS = randomEthereumAddress()
const STREAM_ID = toStreamID('streamId')

const target = Object.freeze({
    sponsorshipAddress: SPONSORSHIP_ADDRESS,
    operatorAddress: OTHER_OPERATOR_ADDRESS,
    streamPart: toStreamPartID(STREAM_ID, 4),
})

const PEER_DESCRIPTOR_ONE = { nodeId: '0x1111' }
const PEER_DESCRIPTOR_TWO = { nodeId: '0x2222' }
const PEER_DESCRIPTOR_THREE = { nodeId: '0x3333' }

const logger = new Logger(module)

describe(findTarget, () => {
    let contractFacade: MockProxy<ContractFacade>
    let assignments: MockProxy<StreamPartAssignments>

    function setupEnv(sponsorships: Array<{ address: EthereumAddress, operators: EthereumAddress[], streamId: StreamID }>) {
        contractFacade.getSponsorshipsOfOperator.mockImplementation(async (operatorAddress) => {
            return sponsorships
                .filter(({ operators }) => operators.includes(operatorAddress))
                .map(({ address, operators, streamId }) => ({
                    sponsorshipAddress: address,
                    operatorCount: operators.length,
                    streamId,
                }))
        })
        contractFacade.getOperatorsInSponsorship.mockImplementation(async (sponsorshipAddress) => {
            return sponsorships.find(({ address }) => address === sponsorshipAddress)!.operators
        })
    }

    function setStreamPartsAssignedToMe(streamParts: StreamPartID[]): void {
        assignments.getMyStreamParts.mockReturnValue(streamParts)
    }

    beforeEach(() => {
        contractFacade = mock<ContractFacade>()
        assignments = mock<StreamPartAssignments>()
    })

    it('returns undefined if no sponsorships are found', async () => {
        setupEnv([])
        const result = await findTarget(MY_OPERATOR_ADDRESS, contractFacade, assignments, logger)
        expect(result).toBeUndefined()
    })

    it('returns undefined if only finds sponsorship with my operator as only operator', async () => {
        setupEnv([{
            address: SPONSORSHIP_ADDRESS,
            operators: [MY_OPERATOR_ADDRESS],
            streamId: STREAM_ID,
        }])
        const result = await findTarget(MY_OPERATOR_ADDRESS, contractFacade, assignments, logger)
        expect(result).toBeUndefined()
    })

    it('returns undefined if no sponsorships found with a partition assigned to me', async () => {
        setupEnv([{
            address: SPONSORSHIP_ADDRESS,
            operators: [MY_OPERATOR_ADDRESS, OTHER_OPERATOR_ADDRESS],
            streamId: STREAM_ID,
        }])
        setStreamPartsAssignedToMe([])
        const result = await findTarget(MY_OPERATOR_ADDRESS, contractFacade, assignments, logger)
        expect(result).toBeUndefined()
    })

    it('returns target sponsorship, operator and stream part', async () => {
        setupEnv([{
            address: SPONSORSHIP_ADDRESS,
            operators: [MY_OPERATOR_ADDRESS, OTHER_OPERATOR_ADDRESS],
            streamId: STREAM_ID,
        }])
        setStreamPartsAssignedToMe([
            toStreamPartID(STREAM_ID, 0),
            toStreamPartID(STREAM_ID, 1),
            toStreamPartID(STREAM_ID, 2),
        ])

        const result = await findTarget(MY_OPERATOR_ADDRESS, contractFacade, assignments, logger)
        expect(result).toMatchObject({
            sponsorshipAddress: SPONSORSHIP_ADDRESS,
            operatorAddress: OTHER_OPERATOR_ADDRESS,
            streamPart: expect.stringMatching(/^streamId#\d$/)
        })
    })

    // TODO: few edge-cases where state changes during asynchronicity
})

describe(findNodesForTarget, () => {
    let getRedundancyFactorFn: jest.MockedFn<(operatorContractAddress: EthereumAddress) => Promise<number | undefined>>
    let operatorFleetState: MockProxy<OperatorFleetState>
    let abortController: AbortController
    let resultPromise: Promise<NetworkPeerDescriptor[]>
    let onlineNodes: NodeID[]

    beforeEach(() => {
        getRedundancyFactorFn = jest.fn()
        onlineNodes = []
        operatorFleetState = mock<OperatorFleetState>()
        operatorFleetState.start.mockImplementation(() => wait(0))
        operatorFleetState.getNodeIds.mockImplementation(() => onlineNodes)
        operatorFleetState.getPeerDescriptor.mockImplementation((nodeId) => {
            if (nodeId === PEER_DESCRIPTOR_ONE.nodeId) {
                return PEER_DESCRIPTOR_ONE
            } else if (nodeId === PEER_DESCRIPTOR_TWO.nodeId) {
                return PEER_DESCRIPTOR_TWO
            } else if (nodeId === PEER_DESCRIPTOR_THREE.nodeId) {
                return PEER_DESCRIPTOR_THREE
            } else {
                return undefined
            }
        })
        abortController = new AbortController()
        resultPromise = findNodesForTarget(target, getRedundancyFactorFn, () => operatorFleetState, 100, abortController.signal, logger)
    })

    afterEach(() => {
        abortController.abort()
    })

    function comeOnline(peerDescriptors: NetworkPeerDescriptor[]): void {
        onlineNodes = peerDescriptors.map(({ nodeId }) => nodeId as NodeID)
    }

    it('returns empty array if no nodes found', async () => {
        const result = await resultPromise
        expect(result).toEqual([])
    })

    it('returns empty array if redundancy factor is undefined', async () => {
        getRedundancyFactorFn.mockResolvedValueOnce(undefined)
        const result = await resultPromise
        expect(result).toEqual([])
    })

    it('returns the single node if single node found', async () => {
        getRedundancyFactorFn.mockResolvedValueOnce(1)
        comeOnline([PEER_DESCRIPTOR_ONE])
        const result = await resultPromise
        expect(result).toEqual([PEER_DESCRIPTOR_ONE])
    })

    it('returns one of the nodes if multiple nodes found (replicationFactor=1)', async () => {
        getRedundancyFactorFn.mockResolvedValueOnce(1)
        comeOnline([PEER_DESCRIPTOR_ONE, PEER_DESCRIPTOR_TWO, PEER_DESCRIPTOR_THREE])
        const result = await resultPromise
        expect(result.length).toEqual(1)
        expect(result).toIncludeAnyMembers([PEER_DESCRIPTOR_ONE, PEER_DESCRIPTOR_TWO, PEER_DESCRIPTOR_THREE])
    })

    it('returns two of the nodes if multiple nodes found (replicationFactor=2)', async () => {
        getRedundancyFactorFn.mockResolvedValueOnce(2)
        comeOnline([PEER_DESCRIPTOR_ONE, PEER_DESCRIPTOR_TWO, PEER_DESCRIPTOR_THREE])
        const result = await resultPromise
        expect(result.length).toEqual(2)
        expect(result).toIncludeAnyMembers([PEER_DESCRIPTOR_ONE, PEER_DESCRIPTOR_TWO, PEER_DESCRIPTOR_THREE])
        expect(result[0]).not.toEqual(result[1])
    })
})

describe(inspectTarget, () => {
    let streamrClient: MockProxy<StreamrClient>
    let abortController: AbortController

    beforeEach(() => {
        streamrClient = mock<StreamrClient>()
        streamrClient.subscribe.mockResolvedValue(mock<Subscription>()) // TODO: test sub/unsub interaction
        abortController = new AbortController()
    })

    afterEach(() => {
        abortController.abort()
    })

    it('returns false if zero nodes online', async () => {
        const result = await inspectTarget({
            target,
            targetPeerDescriptors: [],
            streamrClient,
            abortSignal: abortController.signal,
            logger
        })
        expect(result).toEqual(false)
    })

    it('returns false if no online nodes pass inspection', async () => {
        streamrClient.inspect.mockResolvedValue(false)
        const result = await inspectTarget({
            target,
            targetPeerDescriptors: [PEER_DESCRIPTOR_ONE, PEER_DESCRIPTOR_TWO, PEER_DESCRIPTOR_THREE],
            streamrClient,
            abortSignal: abortController.signal,
            logger
        })
        expect(result).toEqual(false)
        expect(streamrClient.inspect).toHaveBeenCalledTimes(3)
        expect(streamrClient.inspect).toHaveBeenCalledWith(PEER_DESCRIPTOR_ONE, target.streamPart)
        expect(streamrClient.inspect).toHaveBeenCalledWith(PEER_DESCRIPTOR_TWO, target.streamPart)
        expect(streamrClient.inspect).toHaveBeenCalledWith(PEER_DESCRIPTOR_THREE, target.streamPart)
    })

    it('returns true if at least one online node passes inspection', async () => {
        streamrClient.inspect.mockResolvedValueOnce(false)
        streamrClient.inspect.mockResolvedValueOnce(true)
        const result = await inspectTarget({
            target,
            targetPeerDescriptors: [PEER_DESCRIPTOR_ONE, PEER_DESCRIPTOR_TWO, PEER_DESCRIPTOR_THREE],
            streamrClient,
            abortSignal: abortController.signal,
            logger
        })
        expect(result).toEqual(true)
        expect(streamrClient.inspect).toHaveBeenCalledTimes(2)
    })
})
