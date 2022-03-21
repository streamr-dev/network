import { startTracker } from './startTracker'
import { Tracker, TrackerOptions, Event as TrackerEvent } from './logic/Tracker'
import { getTopology } from './logic/trackerSummaryUtils'
import { TrackerServer, Event as TrackerServerEvent } from './protocol/TrackerServer'

export const BrowserTracker = {
    startTracker,
    Tracker,
    // TrackerOptions,
    TrackerEvent,
    getTopology,
    TrackerServer,
    TrackerServerEvent
}
