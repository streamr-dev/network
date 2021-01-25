import { StreamIdAndPartition } from '../identifiers'

export interface ChangeListener {
    onStreamAdded: (stream: StreamIdAndPartition) => void
    onStreamRemoved: (stream: StreamIdAndPartition) => void
}

export interface StorageConfig {
    getStreams: () => StreamIdAndPartition[]
    addChangeListener: (listener: ChangeListener) => void
}