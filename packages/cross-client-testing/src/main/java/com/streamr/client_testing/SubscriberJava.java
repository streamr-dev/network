package com.streamr.client_testing;

import com.streamr.client.MessageHandler;
import com.streamr.client.StreamrClient;
import com.streamr.client.options.ResendOption;
import com.streamr.client.rest.Stream;
import com.streamr.client.utils.Address;

public class SubscriberJava extends Subscriber {
    private final StreamrClient streamrClient;
    private final MessageHandler handler;
    private final Stream stream;
    private final ResendOption resendOption;

    public SubscriberJava(StreamrClient streamrClient, MessageHandler handler, Stream stream, ResendOption resendOption) {
        this.streamrClient = streamrClient;
        this.handler = handler;
        this.stream = stream;
        this.resendOption = resendOption;
    }

    @Override
    public Address getSubscriberId() {
        return this.streamrClient.getPublisherId();
    }

    @Override
    public void start() {
        streamrClient.connect();
        streamrClient.subscribe(stream, 0, handler, resendOption);
    }

    @Override
    public void stop() {
        this.streamrClient.disconnect();
    }
}
