package com.streamr.client_testing;

import com.streamr.client.StreamrClient;

public class StreamrClientJava extends StreamrClientWrapper {
    private final StreamrClient streamrClient;

    public StreamrClientJava(StreamrClient streamrClient) {
        this.streamrClient = streamrClient;
    }

    public StreamrClient getStreamrClient() {
        return streamrClient;
    }
}
