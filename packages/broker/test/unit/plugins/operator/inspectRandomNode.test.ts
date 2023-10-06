import {
    FindNodesForTargetFn,
    FindTargetFn,
    inspectRandomNode,
    InspectTargetFn
} from '../../../../src/plugins/operator/inspectRandomNode'
import { InspectRandomNodeHelper } from '../../../../src/plugins/operator/InspectRandomNodeHelper'
import { mock, MockProxy } from 'jest-mock-extended'
import { StreamPartAssignments } from '../../../../src/plugins/operator/StreamPartAssignments'
import { randomEthereumAddress } from '@streamr/test-utils'
import { StreamPartIDUtils, toStreamID, toStreamPartID } from '@streamr/protocol'
import { EthereumAddress, wait, waitForCondition } from '@streamr/utils'
import { StreamrClient } from 'streamr-client'

const MY_OPERATOR_ADDRESS = randomEthereumAddress()
const OTHER_OPERATOR_ADDRESS = randomEthereumAddress()
const SPONSORSHIP_ADDRESS = randomEthereumAddress()
const STREAM_ID = toStreamID('streamId')

const WAIT_FOR_FLAG_TIMEOUT_IN_MS = 100

const target = Object.freeze({
    sponsorshipAddress: SPONSORSHIP_ADDRESS,
    operatorAddress: OTHER_OPERATOR_ADDRESS,
    streamPart: toStreamPartID(STREAM_ID, 4),
})

const PEER_DESCRIPTOR_ONE = { id: '0x1111' }
const PEER_DESCRIPTOR_TWO = { id: '0x2222' }

describe(inspectRandomNode, () => {
    let helper: MockProxy<InspectRandomNodeHelper>
    let assigments: MockProxy<StreamPartAssignments>
    let streamrClient: MockProxy<StreamrClient>
    let findTargetFn: jest.MockedFn<FindTargetFn>
    let findNodesForTargetFn: jest.MockedFn<FindNodesForTargetFn>
    let inspectTargetFn: jest.MockedFn<InspectTargetFn>
    let getRedundancyFactorFn: jest.MockedFn<(operatorContractAddress: EthereumAddress) => Promise<number | undefined>>
    let abortController: AbortController

    beforeEach(() => {
        helper = mock<InspectRandomNodeHelper>()
        assigments = mock<StreamPartAssignments>()
        streamrClient = mock<StreamrClient>()
        findTargetFn = jest.fn()
        findNodesForTargetFn = jest.fn()
        inspectTargetFn = jest.fn()
        getRedundancyFactorFn = jest.fn()
        getRedundancyFactorFn.mockResolvedValueOnce(1)
        abortController = new AbortController()
    })

    afterEach(() => {
        abortController.abort()
    })

    async function doInspection(): Promise<void> {
        return inspectRandomNode(
            MY_OPERATOR_ADDRESS,
            helper,
            assigments,
            streamrClient,
            200,
            getRedundancyFactorFn,
            abortController.signal,
            findTargetFn,
            findNodesForTargetFn,
            inspectTargetFn
        )
    }

    it('does not flag (or inspect) if does not find target', async () => {
        findTargetFn.mockResolvedValueOnce(undefined)

        await doInspection()
        await wait(WAIT_FOR_FLAG_TIMEOUT_IN_MS)

        expect(inspectTargetFn).not.toHaveBeenCalled()
        expect(helper.flag).not.toHaveBeenCalled()
    })

    it('does not flag if inspection passes', async () => {
        findTargetFn.mockResolvedValueOnce(target)
        findNodesForTargetFn.mockResolvedValueOnce([PEER_DESCRIPTOR_ONE, PEER_DESCRIPTOR_TWO])
        inspectTargetFn.mockResolvedValueOnce(true)

        await doInspection()
        await wait(WAIT_FOR_FLAG_TIMEOUT_IN_MS)

        expect(helper.flag).not.toHaveBeenCalled()
    })

    it('flags if inspection does not pass', async () => {
        findTargetFn.mockResolvedValueOnce(target)
        findNodesForTargetFn.mockResolvedValueOnce([PEER_DESCRIPTOR_ONE, PEER_DESCRIPTOR_TWO])
        inspectTargetFn.mockResolvedValueOnce(false)

        await doInspection()
        await waitForCondition(() => helper.flag.mock.calls.length > 0)

        expect(helper.flag).toHaveBeenCalledWith(
            SPONSORSHIP_ADDRESS,
            OTHER_OPERATOR_ADDRESS,
            StreamPartIDUtils.getStreamPartition(target.streamPart)
        )
    })

    it('findTarget and inspectTarget are called with correct arguments', async () => {
        findTargetFn.mockResolvedValueOnce(target)
        findNodesForTargetFn.mockResolvedValueOnce([PEER_DESCRIPTOR_ONE, PEER_DESCRIPTOR_TWO])
        inspectTargetFn.mockResolvedValueOnce(false)

        await doInspection()
        await waitForCondition(() => helper.flag.mock.calls.length > 0)

        expect(findTargetFn).toHaveBeenCalledWith(MY_OPERATOR_ADDRESS, helper, assigments)
        expect(inspectTargetFn).toHaveBeenCalledWith({
            target,
            targetPeerDescriptors: [PEER_DESCRIPTOR_ONE, PEER_DESCRIPTOR_TWO],
            streamrClient,
            abortSignal: expect.anything()
        })
    })
})
