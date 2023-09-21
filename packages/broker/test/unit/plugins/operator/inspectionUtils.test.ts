import { mock, MockProxy } from 'jest-mock-extended'
import { MessageListener, NetworkPeerDescriptor, StreamrClient, Subscription } from 'streamr-client'
import { createHeartbeatMessage } from '../../../../src/plugins/operator/heartbeatUtils'
import { StreamID, StreamPartID, toStreamID, toStreamPartID } from '@streamr/protocol'
import { randomEthereumAddress } from '@streamr/test-utils'
import { findNodesForTarget, findTarget, inspectTarget } from '../../../../src/plugins/operator/inspectionUtils'
import { InspectRandomNodeHelper } from '../../../../src/plugins/operator/InspectRandomNodeHelper'
import { StreamAssignmentLoadBalancer } from '../../../../src/plugins/operator/StreamAssignmentLoadBalancer'
import { EthereumAddress } from '@streamr/utils'

const MY_OPERATOR_ADDRESS = randomEthereumAddress()
const OTHER_OPERATOR_ADDRESS = randomEthereumAddress()
const SPONSORSHIP_ADDRESS = randomEthereumAddress()
const STREAM_ID = toStreamID('streamId')

const target = Object.freeze({
    sponsorshipAddress: SPONSORSHIP_ADDRESS,
    operatorAddress: OTHER_OPERATOR_ADDRESS,
    streamPart: toStreamPartID(STREAM_ID, 4),
})

const PEER_DESCRIPTOR_ONE = { id: '0x1111' }
const PEER_DESCRIPTOR_TWO = { id: '0x2222' }
const PEER_DESCRIPTOR_THREE = { id: '0x3333' }

describe(findTarget, () => {
    let helper: MockProxy<InspectRandomNodeHelper>
    let loadBalancer: MockProxy<StreamAssignmentLoadBalancer>

    function setupEnv(sponsorships: Array<{ address: EthereumAddress, operators: EthereumAddress[], streamId: StreamID }>) {
        helper.getSponsorshipsOfOperator.mockImplementation(async (operatorAddress) => {
            return sponsorships
                .filter(({ operators }) => operators.includes(operatorAddress))
                .map(({ address, operators, streamId }) => ({
                    sponsorshipAddress: address,
                    operatorCount: operators.length,
                    streamId,
                }))
        })
        helper.getOperatorsInSponsorship.mockImplementation(async (sponsorshipAddress) => {
            return sponsorships.find(({ address }) => address === sponsorshipAddress)!.operators
        })
    }

    function setStreamPartsAssignedToMe(streamParts: StreamPartID[]): void {
        loadBalancer.getMyStreamParts.mockReturnValue(streamParts)
    }

    beforeEach(() => {
        helper = mock<InspectRandomNodeHelper>()
        loadBalancer = mock<StreamAssignmentLoadBalancer>()
    })

    it('returns undefined if no sponsorships are found', async () => {
        setupEnv([])
        const result = await findTarget(MY_OPERATOR_ADDRESS, helper, loadBalancer)
        expect(result).toBeUndefined()
    })

    it('returns undefined if only finds sponsorship with my operator as only operator', async () => {
        setupEnv([{
            address: SPONSORSHIP_ADDRESS,
            operators: [MY_OPERATOR_ADDRESS],
            streamId: STREAM_ID,
        }])
        const result = await findTarget(MY_OPERATOR_ADDRESS, helper, loadBalancer)
        expect(result).toBeUndefined()
    })

    it('returns undefined if no sponsorships found with a partition assigned to me', async () => {
        setupEnv([{
            address: SPONSORSHIP_ADDRESS,
            operators: [MY_OPERATOR_ADDRESS, OTHER_OPERATOR_ADDRESS],
            streamId: STREAM_ID,
        }])
        setStreamPartsAssignedToMe([])
        const result = await findTarget(MY_OPERATOR_ADDRESS, helper, loadBalancer)
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

        const result = await findTarget(MY_OPERATOR_ADDRESS, helper, loadBalancer)
        expect(result).toMatchObject({
            sponsorshipAddress: SPONSORSHIP_ADDRESS,
            operatorAddress: OTHER_OPERATOR_ADDRESS,
            streamPart: expect.stringMatching(/^streamId#\d$/)
        })
    })

    // TODO: few edge-cases where state changes during asynchronicity
})

describe(findNodesForTarget, () => {
    let streamrClient: MockProxy<StreamrClient>
    let getRedundancyFactorFn: jest.MockedFn<(operatorContractAddress: EthereumAddress) => Promise<number | undefined>>
    let abortController: AbortController
    let capturedMessageHandler: MessageListener
    let resultPromise: Promise<NetworkPeerDescriptor[]>

    beforeEach(() => {
        streamrClient = mock<StreamrClient>()
        streamrClient.subscribe.mockImplementation(async (_options, callback) => {
            capturedMessageHandler = callback!
            return mock<Subscription>()
        })
        getRedundancyFactorFn = jest.fn()
        abortController = new AbortController()
        resultPromise = findNodesForTarget(target, streamrClient, getRedundancyFactorFn, 100, abortController.signal)
    })

    afterEach(() => {
        abortController.abort()
    })

    function comeOnline(peerDescriptor: NetworkPeerDescriptor): void {
        capturedMessageHandler(createHeartbeatMessage(peerDescriptor), undefined as any)
    }

    it('returns empty array if no nodes found', async () => {
        const result = await resultPromise
        expect(result).toEqual([])
    })

    it('returns empty array if redundancy factor is undefined', async () => {
        getRedundancyFactorFn.mockResolvedValueOnce(undefined)
        comeOnline(PEER_DESCRIPTOR_ONE)
        comeOnline(PEER_DESCRIPTOR_TWO)
        const result = await resultPromise
        expect(result).toEqual([])
    })

    it('returns the single node if single node found', async () => {
        getRedundancyFactorFn.mockResolvedValueOnce(1)
        comeOnline(PEER_DESCRIPTOR_ONE)
        const result = await resultPromise
        expect(result).toEqual([PEER_DESCRIPTOR_ONE])
    })

    it('returns one of the nodes if multiple nodes found (replicationFactor=1)', async () => {
        getRedundancyFactorFn.mockResolvedValueOnce(1)
        comeOnline(PEER_DESCRIPTOR_ONE)
        comeOnline(PEER_DESCRIPTOR_TWO)
        comeOnline(PEER_DESCRIPTOR_THREE)
        const result = await resultPromise
        expect(result.length).toEqual(1)
        expect(result).toIncludeAnyMembers([PEER_DESCRIPTOR_ONE, PEER_DESCRIPTOR_TWO, PEER_DESCRIPTOR_THREE])
    })

    it('returns two of the nodes if multiple nodes found (replicationFactor=2)', async () => {
        getRedundancyFactorFn.mockResolvedValueOnce(2)
        comeOnline(PEER_DESCRIPTOR_ONE)
        comeOnline(PEER_DESCRIPTOR_TWO)
        comeOnline(PEER_DESCRIPTOR_THREE)
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
        abortController = new AbortController()
    })

    afterEach(() => {
        abortController.abort()
    })

    it('returns false if zero nodes online', async () => {
        const result = await inspectTarget({
            target,
            streamrClient,
            getRedundancyFactor: undefined as any,
            heartbeatLastResortTimeoutInMs: 100,
            abortSignal: abortController.signal,
            findNodesForTargetFn: async () => []
        })
        expect(result).toEqual(false)
    })

    it('returns false if no online nodes pass inspection', async () => {
        streamrClient.inspect.mockResolvedValue(false)
        const result = await inspectTarget({
            target,
            streamrClient,
            getRedundancyFactor: undefined as any,
            heartbeatLastResortTimeoutInMs: 100,
            abortSignal: abortController.signal,
            findNodesForTargetFn: async () => [PEER_DESCRIPTOR_ONE, PEER_DESCRIPTOR_TWO, PEER_DESCRIPTOR_THREE]
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
            streamrClient,
            getRedundancyFactor: undefined as any,
            heartbeatLastResortTimeoutInMs: 100,
            abortSignal: abortController.signal,
            findNodesForTargetFn: async () => [PEER_DESCRIPTOR_ONE, PEER_DESCRIPTOR_TWO, PEER_DESCRIPTOR_THREE]
        })
        expect(result).toEqual(true)
        expect(streamrClient.inspect).toHaveBeenCalledTimes(2)
    })
})
