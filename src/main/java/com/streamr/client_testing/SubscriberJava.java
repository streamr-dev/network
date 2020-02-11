package com.streamr.client_testing;

import com.streamr.client.StreamrClient;

public class SubscriberJava extends Subscriber {
    private final StreamrClient subscriber;

    public SubscriberJava(StreamrClient subscriber) {
        this.subscriber = subscriber;
    }

    @Override
    public String getSubscriberId() {
        return this.subscriber.getPublisherId();
    }

    @Override
    public void start() {
        this.subscriber.connect();
    }

    @Override
    public void stop() {
        this.subscriber.disconnect();
    }
}
