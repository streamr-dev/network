package com.streamr.client_testing;

import com.streamr.client.authentication.EthereumAuthenticationMethod;
import com.streamr.client.options.EncryptionOptions;
import com.streamr.client.rest.Stream;
import com.streamr.client.utils.Address;
import com.streamr.client.utils.GroupKey;

public class StreamrClientJS extends StreamrClientWrapper {
    private final String privateKey;
    private final EthereumAuthenticationMethod auth;
    private final GroupKey groupKey;

    public StreamrClientJS(String privateKey, GroupKey groupKey) {
        this.privateKey = privateKey;
        this.auth = new EthereumAuthenticationMethod(privateKey);
        this.groupKey = groupKey;
    }

    public StreamrClientJS() {
        this(StreamTester.generatePrivateKey(), null);
    }

    public StreamrClientJS(GroupKey groupKey) {
        this(StreamTester.generatePrivateKey(), groupKey);
    }

    public String getPrivateKey() {
        return privateKey;
    }

    public GroupKey getGroupKey() {
        return groupKey;
    }

    @Override
    public Address getAddress() {
        return new Address(auth.getAddress());
    }

    @Override
    public String getImplementation() {
        return "Javascript";
    }

    @Override
    public PublisherThread toPublisherThread(Stream stream, PublishFunction publishFunction, long interval, int maxMessages) {
        return new PublisherThreadJS(this, stream, publishFunction, interval, maxMessages);
    }
}
