package com.streamr.client_testing;

import com.streamr.client.rest.Stream;

public abstract class StreamrClientWrapper {
    public abstract String getAddress();
    public abstract String getImplementation();
    public abstract PublisherThread toPublisherThread(Stream stream, PublishFunction publishFunction, long interval, int maxMessages);
}
