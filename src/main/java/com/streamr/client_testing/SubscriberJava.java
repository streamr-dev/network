package com.streamr.client_testing;

import com.streamr.client.StreamrClient;

public class SubscriberJava extends Subscriber {
    private final StreamrClient subscriber;
    private final Runnable onStart;

    public SubscriberJava(StreamrClient subscriber, Runnable onStart) {
        this.subscriber = subscriber;
        this.onStart = onStart;
    }

    @Override
    public String getSubscriberId() {
        return this.subscriber.getPublisherId();
    }

    @Override
    public void start() {
        this.subscriber.connect();
        onStart.run();
    }

    @Override
    public void stop() {
        this.subscriber.disconnect();
    }
}
