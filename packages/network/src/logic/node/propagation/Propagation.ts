import { SPID, StreamMessage } from 'streamr-client-protocol'
import { NodeId } from '../Node'
import { PropagationTaskStore } from './PropagationTaskStore'

type GetNeighborsFn = (spid: SPID) => ReadonlyArray<NodeId>

type SendToNeighborFn = (neighborId: NodeId, msg: StreamMessage) => void

type ConstructorOptions = {
    getNeighbors: GetNeighborsFn
    sendToNeighbor: SendToNeighborFn
    minPropagationTargets: number
    ttl?: number
    maxMessages?: number
}

const DEFAULT_MAX_MESSAGES = 10000
const DEFAULT_TTL = 30 * 1000

/**
 * Message propagation logic of a node. Given a message, this class will actively attempt to propagate it to
 * `minPropagationTargets` neighbors until success or TTL expiration.
 *
 * Setting `minPropagationTargets = 0` effectively disables any propagation reattempts. A message will then
 * only be propagated exactly once, to neighbors that are present at that moment, in a fire-and-forget manner.
 */

export class Propagation {
    private readonly getNeighbors: GetNeighborsFn
    private readonly sendToNeighbor: SendToNeighborFn
    private readonly minPropagationTargets: number
    private readonly activeTaskStore: PropagationTaskStore

    constructor({
        getNeighbors,
        sendToNeighbor,
        minPropagationTargets,
        ttl = DEFAULT_TTL,
        maxMessages = DEFAULT_MAX_MESSAGES
    }: ConstructorOptions) {
        this.getNeighbors = getNeighbors
        this.sendToNeighbor = sendToNeighbor
        this.minPropagationTargets = minPropagationTargets
        this.activeTaskStore = new PropagationTaskStore(ttl, maxMessages)
    }

    /**
     * Node should invoke this when it learns about a new message
     */
    feedUnseenMessage(message: StreamMessage, source: NodeId | null): void {
        const spid = message.getSPID()
        const targetNeighbors = this.getNeighbors(spid).filter((n) => n !== source)

        targetNeighbors.forEach((neighborId) => {
            this.sendToNeighbor(neighborId, message)
        })

        if (targetNeighbors.length < this.minPropagationTargets) {
            this.activeTaskStore.add({
                message,
                source,
                handledNeighbors: new Set<NodeId>(targetNeighbors)
            })
        }
    }

    /**
     * Node should invoke this when it learns about a new node stream assignment
     */
    onNeighborJoined(neighborId: NodeId, spid: SPID): void {
        const tasksOfSPID = this.activeTaskStore.get(spid)
        tasksOfSPID.forEach(({ handledNeighbors, source, message}) => {
            if (!handledNeighbors.has(neighborId) && neighborId !== source) {
                this.sendToNeighbor(neighborId, message)
                handledNeighbors.add(neighborId)
                if (handledNeighbors.size >= this.minPropagationTargets) {
                    this.activeTaskStore.delete(message.messageId)
                }
            }
        })
    }
}