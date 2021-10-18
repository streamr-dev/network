import { Tracker } from '../../src/logic/tracker/Tracker'
import { TrackerServer, Event as TrackerServerEvent } from '../../src/protocol/TrackerServer'

const SOURCE_NODE = 'source-node'
const TARGET_NODE_1 = 'target-node-1'
const TARGET_NODE_2 = 'target-node-2'
const STREAM_SPID_KEY = 's1#0'
const STREAM_KEY = 's1::0'
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
        expect(createTopology).toBeCalledTimes(1)
        expect(createTopology).toBeCalledWith(STREAM_SPID_KEY)
        expect(updateNodeOnStream).toBeCalledTimes(1)
        expect(updateNodeOnStream.mock.calls[0][0]).toBe(SOURCE_NODE)
        const actualStatus = updateNodeOnStream.mock.calls[0][1]
        expect(actualStatus).toContainEntries([
            ['counter', COUNTER],
            ['neighbors', [TARGET_NODE_1, TARGET_NODE_2]],
            ['spidKey', STREAM_SPID_KEY]
        ])
        expect(formAndSendInstructions).toBeCalledTimes(1)
        expect(formAndSendInstructions).toBeCalledWith(SOURCE_NODE, STREAM_SPID_KEY)
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