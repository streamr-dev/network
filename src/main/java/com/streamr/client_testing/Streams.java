package com.streamr.client_testing;

import com.streamr.client.StreamrClient;
import com.streamr.client.authentication.EthereumAuthenticationMethod;
import com.streamr.client.options.*;
import com.streamr.client.utils.UnencryptedGroupKey;

import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.function.Consumer;
import java.util.function.Function;
import java.util.function.Supplier;

public class Streams {
    public static final String[] SETUPS_NAMES = {
            "stream-cleartext-unsigned",
            "stream-cleartext-signed",
            "stream-encrypted-shared-signed",
            "stream-encrypted-shared-rotating-signed",
            "stream-encrypted-exchanged-rotating-signed"
    };
    private final String restApiUrl;
    private final String websocketApiUrl;
    private final boolean testCorrectness;
    private final HashMap<String, Consumer<StreamTester>> streams = new HashMap<>();
    private StreamTester activeStreamTester;

    public Streams(String restApiUrl, String websocketApiUrl, boolean testCorrectness) {
        this.restApiUrl = restApiUrl;
        this.websocketApiUrl = websocketApiUrl;
        this.testCorrectness = testCorrectness;
        streams.put(SETUPS_NAMES[0], this::cleartextUnsignedStream);
        streams.put(SETUPS_NAMES[1], this::cleartextSignedStream);
        streams.put(SETUPS_NAMES[2], this::encryptedSharedKeySignedStream);
        streams.put(SETUPS_NAMES[3], this::encryptedSharedRotatingKeySignedStream);
        streams.put(SETUPS_NAMES[4], this::encryptedExchangedRotatingKeySignedStream);
    }

    public void checkMsgsCorrectness() {
        activeStreamTester.checkMsgsCorrectness();
    }

    public void start(String name) {
        if (testCorrectness) {
            startStream(name);
            try {
                Thread.sleep(30 * 1000);
            } catch (InterruptedException e) {
                e.printStackTrace();
            }
            stop();
            checkMsgsCorrectness();
        } else {
            startStream(name);
        }
    }

    public void stop() {
        if (activeStreamTester != null) {
            activeStreamTester.stop();
        }
    }

    private void startStream(String name) {
        if (!streams.containsKey(name)) {
            throw new IllegalArgumentException("No test stream with name: " + name);
        }
        activeStreamTester = build(name, streams.get(name));
        activeStreamTester.start();
    }

    private StreamTester build(String name, Consumer<StreamTester> addParticipants) {
        StreamTester streamTester = new StreamTester(name, restApiUrl, websocketApiUrl, testCorrectness);
        System.out.println("Creating publishers and subscribers for '" + name + "'...");
        addParticipants.accept(streamTester);
        System.out.println("Created publishers and subscribers for '" + name + "'!");
        System.out.println("Initialized '" + name + "'!");
        return streamTester;
    }

    private void cleartextUnsignedStream(StreamTester streamTester) {
        StreamrClient[] publishers = buildClients(this::buildCleartextNoSigningClient, 2);
        StreamrClient[] subscribers = buildClients(this::buildCleartextNoSigningClient, 6);

        streamTester.addPublisher(publishers[0], streamTester.getDefaultPublishFunction(), 1000);
        streamTester.addPublisher(publishers[1], streamTester.getDefaultPublishFunction(), 1200);
        streamTester.addSubscribers(subscribers[0], subscribers[1], subscribers[2]);
        streamTester.addDelayedSubscriber(subscribers[3], new ResendFromOption(new Date()), 10000);
        streamTester.addDelayedSubscriber(subscribers[5], new ResendLastOption(10), 15000);
    }

    private void cleartextSignedStream(StreamTester streamTester) {
        StreamrClient[] publishers = buildClients(this::buildCleartextSigningClient, 2);
        // StreamrClient[] subscribers = buildClients(this::buildCleartextSigningClient, 6);

        streamTester.addPublisher(publishers[0], streamTester.getDefaultPublishFunction(), 1100);
        streamTester.addPublisher(publishers[1], streamTester.getDefaultPublishFunction(), 1300);
        streamTester.addJavascriptPublisher(new StreamrClientJS(), 1200);
        // streamTester.addJavascriptPublisher(1500);
        // streamTester.addSubscribers(subscribers[0], subscribers[1], subscribers[2]);
        streamTester.addJavascriptSubscriber(new StreamrClientJS(), null);
        streamTester.addDelayedJavascriptSubscriber(new StreamrClientJS(), new ResendLastOption(10), 10000);
        streamTester.addDelayedJavascriptSubscriber(new StreamrClientJS(), new ResendFromOption(new Date()), 15000);
        // streamTester.addJavascriptSubscriber(null);
        /*
        streamTester.addDelayedSubscriber(subscribers[3], new ResendFromOption(new Date()), 10000);
        Date t1 = new Date((new Date()).getTime() + 5000);
        Date t2 = new Date((new Date()).getTime() + 10000);
        streamTester.addDelayedSubscriber(subscribers[4], new ResendRangeOption(t1, t2), 12000);
        streamTester.addDelayedSubscriber(subscribers[5], new ResendLastOption(10), 15000);*/
    }

    private void encryptedSharedKeySignedStream(StreamTester streamTester) {
        String streamId = streamTester.getStreamId();
        StreamrClientWrapper[][] participants = buildSharedKeyParticipants(streamId, 2, 2, 2, 2);

        streamTester.addPublishers(streamTester.getDefaultPublishFunction(), 1000, 3000, participants[0]);
        streamTester.addSubscribers(participants[1]);
    }

    private void encryptedSharedRotatingKeySignedStream(StreamTester streamTester) {
        String streamId = streamTester.getStreamId();
        StreamrClientWrapper[][] participants = buildSharedKeyParticipants(streamId, 2, 2, 2, 2);

        streamTester.addPublishers(streamTester.getRotatingPublishFunction(), 1000, 3000, participants[0]);
        streamTester.addSubscribers(participants[1]);
    }

    private void encryptedExchangedRotatingKeySignedStream(StreamTester streamTester) {
        String streamId = streamTester.getStreamId();

        UnencryptedGroupKey groupKey1 = StreamTester.generateGroupKey();
        UnencryptedGroupKey groupKey2 = StreamTester.generateGroupKey();

        StreamrClient publisher1 = buildEncryptedSigningClient(streamId, null, groupKey1);
        StreamrClient publisher2 = buildEncryptedSigningClient(streamId, null, groupKey2);
        ArrayList<String> publisherIds = new ArrayList<>();
        publisherIds.add(publisher1.getPublisherId());
        publisherIds.add(publisher2.getPublisherId());
        StreamrClient[] subscribers = buildClients(this::buildCleartextSigningClient, 6);
        streamTester.addPublisher(publisher1, streamTester.getRotatingPublishFunction(), 1000);
        streamTester.addPublisher(publisher2, streamTester.getRotatingPublishFunction(), 1350);
        streamTester.addSubscribers(subscribers[0], subscribers[1], subscribers[2]);

        /*
        streamTester.addDelayedSubscriber(subscribers[3], new ResendFromOption(new Date()), 8000);
        streamTester.addDelayedSubscriber(subscribers[5], new ResendLastOption(10), 10000);*/
    }

    private StreamrClient[] buildClients(Supplier<StreamrClient> clientSupplier, int n) {
        StreamrClient[] clients = new StreamrClient[n];
        for (int i = 0; i < n; i++) {
            clients[i] = clientSupplier.get();
        }
        return clients;
    }

    private StreamrClientWrapper[][] buildSharedKeyParticipants(String streamId, int nbJavaPublishers,
        int nbJavaSubscribers, int nbJSPublishers, int nbJSSubscribers) {
        UnencryptedGroupKey groupKey = StreamTester.generateGroupKey();

        StreamrClientWrapper[] publishers = new StreamrClientWrapper[nbJavaPublishers + nbJSPublishers];
        ArrayList<String> publisherIds = new ArrayList<>();
        for (int i = 0; i < nbJavaPublishers; i++) {
            StreamrClient p = buildEncryptedSigningClient(streamId, null, groupKey);
            publishers[i] = new StreamrClientJava(p);
            publisherIds.add(p.getPublisherId());
        }
        for (int i = nbJavaPublishers; i < nbJavaPublishers + nbJSPublishers; i++) {
            StreamrClientJS p = new StreamrClientJS(buildEncryptionOptions(streamId, null, groupKey));
            publishers[i] = p;
            publisherIds.add(p.getAddress());
        }
        StreamrClientWrapper[] subscribers = new StreamrClientWrapper[nbJavaSubscribers + nbJSSubscribers];
        for (int i = 0; i < nbJavaSubscribers; i++) {
            subscribers[i] = new StreamrClientJava(buildEncryptedSigningClient(streamId, publisherIds, groupKey));
        }
        for (int i = nbJavaSubscribers; i < nbJavaSubscribers + nbJSSubscribers; i++) {
            subscribers[i] = new StreamrClientJS(buildEncryptionOptions(streamId, publisherIds, groupKey));
        }
        StreamrClientWrapper[][] participants = {publishers, subscribers};
        return participants;
    }

    /*
    Returns a StreamrClient that publishes unsigned messages in cleartext and accepts unsigned messages.
     */
    private StreamrClient buildCleartextNoSigningClient() {
        SigningOptions signingOptions = new SigningOptions(SigningOptions.SignatureComputationPolicy.NEVER, SigningOptions.SignatureVerificationPolicy.NEVER);
        return new StreamrClient(new StreamrClientOptions(
                new EthereumAuthenticationMethod(StreamTester.generatePrivateKey()), signingOptions,
                EncryptionOptions.getDefault(), websocketApiUrl, restApiUrl));
    }

    /*
    Returns a StreamrClient that publishes signed messages in cleartext and verifies the signature of the messages received.
     */
    private StreamrClient buildCleartextSigningClient() {
        return new StreamrClient(new StreamrClientOptions(
                new EthereumAuthenticationMethod(StreamTester.generatePrivateKey()), SigningOptions.getDefault(),
                EncryptionOptions.getDefault(), websocketApiUrl, restApiUrl));
    }

    /*
    Returns a StreamrClient that publishes signed messages encrypted with 'groupKey'. It verifies the signature of
    the messages received and decrypts them also with 'groupKey'. It already knows all the publishers.
     */
    private StreamrClient buildEncryptedSigningClient(String streamId, ArrayList<String> publisherIds, UnencryptedGroupKey groupKey) {
        EncryptionOptions encryptionOptions = buildEncryptionOptions(streamId, publisherIds, groupKey);
        return new StreamrClient(new StreamrClientOptions(
                new EthereumAuthenticationMethod(StreamTester.generatePrivateKey()), SigningOptions.getDefault(),
                encryptionOptions, websocketApiUrl, restApiUrl));
    }

    private EncryptionOptions buildEncryptionOptions(String streamId, ArrayList<String> publisherIds, UnencryptedGroupKey groupKey) {
        HashMap<String, UnencryptedGroupKey> publisher = new HashMap<>();
        publisher.put(streamId, groupKey);
        HashMap<String, HashMap<String, UnencryptedGroupKey>> subscriber = new HashMap<>();
        HashMap<String, UnencryptedGroupKey> keyPerPublisher = new HashMap<>();
        if (publisherIds != null) {
            for (String publisherId: publisherIds) {
                keyPerPublisher.put(publisherId, groupKey);
            }
        }
        subscriber.put(streamId, keyPerPublisher);
        return new EncryptionOptions(publisher, subscriber);
    }
}
