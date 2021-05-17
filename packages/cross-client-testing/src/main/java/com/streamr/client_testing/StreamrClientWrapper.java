package com.streamr.client_testing;

import com.streamr.client.rest.Stream;
import com.streamr.client.utils.Address;

public abstract class StreamrClientWrapper {
    public abstract Address getAddress();
    public abstract String getImplementation();
    public abstract PublisherThread toPublisherThread(Stream stream, PublishFunction publishFunction, long interval, int maxMessages);
}
