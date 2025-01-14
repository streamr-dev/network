import { Operator, StreamrClient, Subscription } from '@streamr/sdk'
import { randomEthereumAddress } from '@streamr/test-utils'
import { EthereumAddress, Logger, StreamID, StreamPartID, toStreamID, toStreamPartID } from '@streamr/utils'
import { MockProxy, mock } from 'jest-mock-extended'
import { StreamPartAssignments } from '../../../../src/plugins/operator/StreamPartAssignments'
import { findTarget, inspectTarget } from '../../../../src/plugins/operator/inspectionUtils'

const MY_OPERATOR_ADDRESS = randomEthereumAddress()
const OTHER_OPERATOR_ADDRESS = randomEthereumAddress()
const SPONSORSHIP_ADDRESS = randomEthereumAddress()
const STREAM_ID = toStreamID('streamId')

const target = Object.freeze({
    sponsorshipAddress: SPONSORSHIP_ADDRESS,
    operatorAddress: OTHER_OPERATOR_ADDRESS,
    streamPart: toStreamPartID(STREAM_ID, 4)
})

const PEER_DESCRIPTOR_ONE = { nodeId: '0x1111' }
const PEER_DESCRIPTOR_TWO = { nodeId: '0x2222' }
const PEER_DESCRIPTOR_THREE = { nodeId: '0x3333' }

const logger = new Logger(module)

describe(findTarget, () => {
    let operator: MockProxy<Operator>
    let assignments: MockProxy<StreamPartAssignments>

    function setupEnv(sponsorships: { address: EthereumAddress; operators: EthereumAddress[]; streamId: StreamID }[]) {
        operator.getSponsorships.mockImplementation(async () => {
            return sponsorships
                .filter(({ operators }) => operators.includes(MY_OPERATOR_ADDRESS))
                .map(({ address, operators, streamId }) => ({
                    sponsorshipAddress: address,
                    operatorCount: operators.length,
                    streamId
                }))
        })
        operator.getOperatorsInSponsorship.mockImplementation(async (sponsorshipAddress) => {
            return sponsorships.find(({ address }) => address === sponsorshipAddress)!.operators
        })
    }

    function setStreamPartsAssignedToMe(streamParts: StreamPartID[]): void {
        assignments.getMyStreamParts.mockReturnValue(streamParts)
    }

    beforeEach(() => {
        operator = mock<Operator>()
        assignments = mock<StreamPartAssignments>()
    })

    it('returns undefined if no sponsorships are found', async () => {
        setupEnv([])
        const result = await findTarget(MY_OPERATOR_ADDRESS, operator, assignments, undefined as any, logger)
        expect(result).toBeUndefined()
    })

    it('returns undefined if only finds sponsorship with my operator as only operator', async () => {
        setupEnv([
            {
                address: SPONSORSHIP_ADDRESS,
                operators: [MY_OPERATOR_ADDRESS],
                streamId: STREAM_ID
            }
        ])
        const result = await findTarget(MY_OPERATOR_ADDRESS, operator, assignments, undefined as any, logger)
        expect(result).toBeUndefined()
    })

    it('returns undefined if no sponsorships found with a partition assigned to me', async () => {
        setupEnv([
            {
                address: SPONSORSHIP_ADDRESS,
                operators: [MY_OPERATOR_ADDRESS, OTHER_OPERATOR_ADDRESS],
                streamId: STREAM_ID
            }
        ])
        setStreamPartsAssignedToMe([])
        const result = await findTarget(MY_OPERATOR_ADDRESS, operator, assignments, undefined as any, logger)
        expect(result).toBeUndefined()
    })

    it('returns target sponsorship, operator and stream part', async () => {
        setupEnv([
            {
                address: SPONSORSHIP_ADDRESS,
                operators: [MY_OPERATOR_ADDRESS, OTHER_OPERATOR_ADDRESS],
                streamId: STREAM_ID
            }
        ])
        setStreamPartsAssignedToMe([
            toStreamPartID(STREAM_ID, 0),
            toStreamPartID(STREAM_ID, 1),
            toStreamPartID(STREAM_ID, 2)
        ])

        const client = {
            getOperator: () => ({
                hasOpenFlag: async () => false
            })
        }
        const result = await findTarget(MY_OPERATOR_ADDRESS, operator, assignments, client as any, logger)
        expect(result).toMatchObject({
            sponsorshipAddress: SPONSORSHIP_ADDRESS,
            operatorAddress: OTHER_OPERATOR_ADDRESS,
            streamPart: expect.stringMatching(/^streamId#\d$/)
        })
    })

    // TODO: few edge-cases where state changes during asynchronicity
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

    // TODO: re-enable when full inspection re-enabled
    it.skip('returns false if no online nodes pass inspection', async () => {
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

    // TODO: re-enable when full inspection re-enabled
    it.skip('returns true if at least one online node passes inspection', async () => {
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
