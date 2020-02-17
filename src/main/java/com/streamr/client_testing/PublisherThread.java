package com.streamr.client_testing;

public abstract class PublisherThread {
    protected final long interval;

    public PublisherThread(long interval) {
        this.interval = interval;
    }

    public long getInterval() {
        return interval;
    }
    public abstract String getPublisherId();
    public abstract void start();
    public abstract void stop();
}
