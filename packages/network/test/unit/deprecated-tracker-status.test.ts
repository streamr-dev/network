import { Tracker } from '../../src/logic/tracker/Tracker'
import { TrackerServer, Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'
import { createStreamPartId } from "../utils"

const SOURCE_NODE = 'source-node'
const TARGET_NODE_1 = 'target-node-1'
const TARGET_NODE_2 = 'target-node-2'
const STREAM_ID = 's1'
const STREAM_PARTITION = 0
const STREAM_KEY = `${STREAM_ID}::${STREAM_PARTITION}`
const COUNTER = 123

describe('Tracker reads deprecated status format', () => {

    let trackerServer: TrackerServer
    let createTopology: any
    let updateNodeOnStream: any
    let formAndSendInstructions: any

    beforeAll(() => {
        trackerServer = new TrackerServer({
            on: jest.fn(),
            resolveAddress: jest.fn()
        } as any)
        const tracker = new Tracker({
            maxNeighborsPerNode: 999,
            protocols: {
                trackerServer
            }
        } as any)
        createTopology = jest.spyOn(tracker as any, 'createTopology').mockImplementation()
        updateNodeOnStream = jest.spyOn(tracker as any, 'updateNodeOnStream').mockImplementation()
        formAndSendInstructions = jest.spyOn(tracker as any, 'formAndSendInstructions').mockImplementation()
    })

    const assertStatusProcessed = () => {
        const streamPartId = createStreamPartId(STREAM_ID, STREAM_PARTITION)
        expect(createTopology).toBeCalledTimes(1)
        expect(createTopology).toBeCalledWith(streamPartId)
        expect(updateNodeOnStream).toBeCalledTimes(1)
        expect(updateNodeOnStream.mock.calls[0][0]).toBe(SOURCE_NODE)
        const actualStatus = updateNodeOnStream.mock.calls[0][1]
        expect(actualStatus).toContainEntries([
            ['id', STREAM_ID],
            ['partition', STREAM_PARTITION],
            ['neighbors', [TARGET_NODE_1, TARGET_NODE_2]],
            ['counter', COUNTER],
        ])
        expect(formAndSendInstructions).toBeCalledTimes(1)
        expect(formAndSendInstructions).toBeCalledWith(SOURCE_NODE, streamPartId)
    }

    it('multiple streams format', () => {
        const status: any = {
            streams: {
                [STREAM_KEY]: {
                    inboundNodes: [TARGET_NODE_1, TARGET_NODE_2],
                    counter: COUNTER
                }
            }
        }
        trackerServer.emit(TrackerServerEvent.NODE_STATUS_RECEIVED, { status }, SOURCE_NODE)
        assertStatusProcessed()
    })

    it('single stream format', () => {
        const status: any = {
            stream: {
                streamKey: STREAM_KEY,
                inboundNodes: [TARGET_NODE_1, TARGET_NODE_2],
                counter: COUNTER
            }
        }
        trackerServer.emit(TrackerServerEvent.NODE_STATUS_RECEIVED, { status }, SOURCE_NODE)
        assertStatusProcessed()
    })

    it('neighbor format', () => {
        const status: any = {
            stream: {
                streamKey: STREAM_KEY,
                neighbors: [TARGET_NODE_1, TARGET_NODE_2],
                counter: COUNTER
            }
        }
        trackerServer.emit(TrackerServerEvent.NODE_STATUS_RECEIVED, { status }, SOURCE_NODE)
        assertStatusProcessed()
    })
})