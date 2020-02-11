package com.streamr.client_testing;

public abstract class PublisherThread {
    public abstract String getPublisherId();
    public abstract void start();
    public abstract void stop();
}
