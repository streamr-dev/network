package com.streamr.client_testing;

import com.streamr.client.utils.Address;

import java.util.function.Consumer;

public abstract class PublisherThread {
    protected final long interval;

    public PublisherThread(long interval) {
        this.interval = interval;
    }

    public long getInterval() {
        return interval;
    }
    public abstract void setOnPublished(Consumer<String> onPublished);
    public abstract Address getPublisherId();
    public abstract void start();
    public abstract void stop();
    public abstract boolean isReady();
}
