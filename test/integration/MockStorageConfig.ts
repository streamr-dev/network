import { ChangeListener, StorageConfig } from '../../src/logic/StorageConfig'
import { StreamIdAndPartition, StreamKey } from '../../src/identifiers'

export class MockStorageConfig implements StorageConfig {
    private streams: Set<StreamKey> = new Set()

    private listeners: ChangeListener[] = []

    getStreams(): StreamIdAndPartition[] {
        return Array.from(this.streams.values()).map((key) => StreamIdAndPartition.fromKey(key))
    }

    addChangeListener(listener: ChangeListener): void {
        this.listeners.push(listener)
    }

    addStream(stream: StreamIdAndPartition): void {
        this.streams.add(stream.key())
        this.listeners.forEach((listener) => listener.onStreamAdded(stream))
    }

    removeStream(stream: StreamIdAndPartition): void {
        this.streams.delete(stream.key())
        this.listeners.forEach((listener) => listener.onStreamRemoved(stream))
    }
}
