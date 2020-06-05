package com.streamr.client_testing;

import com.streamr.client.StreamrClient;
import com.streamr.client.authentication.EthereumAuthenticationMethod;
import com.streamr.client.options.*;
import com.streamr.client.utils.UnencryptedGroupKey;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.HashMap;
import java.util.function.Consumer;
import java.util.function.Supplier;

public class Streams {
    public static final String[] SETUPS_NAMES = {
            "stream-cleartext-unsigned",
            "stream-cleartext-signed",
            "stream-encrypted-shared-signed",
            "stream-encrypted-shared-rotating-signed",
            "stream-encrypted-exchanged-rotating-signed",
            "stream-encrypted-exchanged-rotating-revoking-signed"
    };
    private final Participants ps;
    private final String restApiUrl;
    private final String websocketApiUrl;
    private final boolean testCorrectness;
    private final HashMap<String, Consumer<StreamTester>> streams = new HashMap<>();
    private StreamTester activeStreamTester;

    public Streams(Participants participants, String restApiUrl, String websocketApiUrl, boolean testCorrectness) {
        this.ps = participants;
        Main.logger.info("Using REST URL: " + restApiUrl);
        this.restApiUrl = restApiUrl;
        Main.logger.info("Using WebSockets URL: " + websocketApiUrl);
        this.websocketApiUrl = websocketApiUrl;
        this.testCorrectness = testCorrectness;
        streams.put(SETUPS_NAMES[0], this::cleartextUnsignedStream);
        streams.put(SETUPS_NAMES[1], this::cleartextSignedStream);
        streams.put(SETUPS_NAMES[2], this::encryptedSharedKeySignedStream);
        streams.put(SETUPS_NAMES[3], this::encryptedSharedRotatingKeySignedStream);
        streams.put(SETUPS_NAMES[4], this::encryptedExchangedRotatingKeySignedStream);
        streams.put(SETUPS_NAMES[5], this::encryptedExchangedRotatingRevokingKeySignedStream);
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
        Main.logger.info("Creating " + ps.getTotal() + " publishers and subscribers for '" + name + "'...");
        addParticipants.accept(streamTester);
        Main.logger.info("Created publishers and subscribers for '" + name + "'!");
        return streamTester;
    }

    private void cleartextUnsignedStream(StreamTester streamTester) {
        StreamrClientWrapper[] publishers = buildClientsWithoutKeys(this::buildCleartextNoSigningClient, ps.getNbJavaPublishers(), ps.getNbJavascriptPublishers());
        StreamrClientWrapper[] subscribers = buildClientsWithoutKeys(this::buildCleartextNoSigningClient, ps.getNbJavaSubscribers(), ps.getNbJavascriptSubscribers());

        streamTester.addPublishers(streamTester.getDefaultPublishFunction(), 800, 2500, publishers);
        addSubscribersWithResend(streamTester, subscribers);
    }

    private void cleartextSignedStream(StreamTester streamTester) {
        StreamrClientWrapper[] publishers = buildClientsWithoutKeys(this::buildCleartextSigningClient, ps.getNbJavaPublishers(), ps.getNbJavascriptPublishers());
        StreamrClientWrapper[] subscribers = buildClientsWithoutKeys(this::buildCleartextSigningClient, ps.getNbJavaSubscribers(), ps.getNbJavascriptSubscribers());

        streamTester.addPublishers(streamTester.getDefaultPublishFunction(), 800, 2500, publishers);

        StreamrClientWrapper[] javaSubscribers = Arrays.copyOfRange(subscribers, 0, ps.getNbJavaSubscribers());
        StreamrClientWrapper[] javascriptSubscribers = Arrays.copyOfRange(subscribers, ps.getNbJavaSubscribers(), subscribers.length);
        addSubscribersWithResend(streamTester, javaSubscribers);
        addSubscribersWithResend(streamTester, javascriptSubscribers);
    }

    private void encryptedSharedKeySignedStream(StreamTester streamTester) {
        String streamId = streamTester.getStreamId();
        StreamrClientWrapper[][] participants = buildSharedKeyParticipants(streamId,
                ps.getNbJavaPublishers(), ps.getNbJavaSubscribers(), ps.getNbJavascriptPublishers(), ps.getNbJavascriptSubscribers());

        streamTester.addPublishers(streamTester.getDefaultPublishFunction(), 800, 2500, participants[0]);
        streamTester.addSubscribers(participants[1]);
    }

    private void encryptedSharedRotatingKeySignedStream(StreamTester streamTester) {
        String streamId = streamTester.getStreamId();
        StreamrClientWrapper[][] participants = buildSharedKeyParticipants(streamId,
                ps.getNbJavaPublishers(), ps.getNbJavaSubscribers(), ps.getNbJavascriptPublishers(), ps.getNbJavascriptSubscribers());

        streamTester.addPublishers(streamTester.getRotatingPublishFunction(5), 800, 2500, participants[0]);
        streamTester.addSubscribers(participants[1]);
    }

    private void encryptedExchangedRotatingKeySignedStream(StreamTester streamTester) {
        encryptedExchangeStreamHelper(streamTester, streamTester.getRotatingPublishFunction(10));
    }

    private void encryptedExchangedRotatingRevokingKeySignedStream(StreamTester streamTester) {
        encryptedExchangeStreamHelper(streamTester, streamTester.getRotatingRevokingPublishFunction(10, 20));
    }

    private void encryptedExchangeStreamHelper(StreamTester streamTester, PublishFunction publishFunction) {
        String streamId = streamTester.getStreamId();

        StreamrClientJava[] javaPublishers = new StreamrClientJava[ps.getNbJavaPublishers()];
        for (int i = 0; i < ps.getNbJavaPublishers(); i++) {
            javaPublishers[i] = buildEncryptedSigningClient(streamId, null, StreamTester.generateGroupKey());
        }
        streamTester.addPublishers(publishFunction, 1000, 2500, javaPublishers);
        StreamrClientJS[] javascriptPublishers = new StreamrClientJS[ps.getNbJavascriptPublishers()];
        for (int i = 0; i < ps.getNbJavascriptPublishers(); i++) {
            javascriptPublishers[i] = new StreamrClientJS(buildEncryptionOptions(streamId, null, StreamTester.generateGroupKey()));
        }
        streamTester.addPublishers(publishFunction, 1000, 2500, javascriptPublishers);

        StreamrClientWrapper[] subscribers = buildClientsWithoutKeys(this::buildCleartextSigningClient, ps.getNbJavaSubscribers(), ps.getNbJavascriptSubscribers());
        StreamrClientWrapper[] javaSubscribers = Arrays.copyOfRange(subscribers, 0, ps.getNbJavaSubscribers());
        StreamrClientWrapper[] javascriptSubscribers = Arrays.copyOfRange(subscribers, ps.getNbJavaSubscribers(), subscribers.length);
        addSubscribersWithResend(streamTester, javaSubscribers);
        addSubscribersWithResend(streamTester, javascriptSubscribers);
    }

    private StreamrClientWrapper[] buildClientsWithoutKeys(Supplier<StreamrClient> clientSupplier, int nbJavaClients, int nbJavascriptClients) {
        StreamrClientWrapper[] clients = new StreamrClientWrapper[nbJavaClients + nbJavascriptClients];
        for (int i = 0; i < nbJavaClients; i++) {
            clients[i] = new StreamrClientJava(clientSupplier.get());
        }
        for (int i = nbJavaClients; i < nbJavaClients + nbJavascriptClients; i++) {
            clients[i] = new StreamrClientJS();
        }
        return clients;
    }

    private void addSubscribersWithResend(StreamTester streamTester, StreamrClientWrapper[] subscribers) {
        if (subscribers.length > 2) {
            for (int i = 0; i < subscribers.length - 2; i++) {
                streamTester.addSubscriber(subscribers[i], null);
            }
            streamTester.addDelayedSubscriber(subscribers[subscribers.length - 2], new ResendFromOption(new Date()), 8000);
            streamTester.addDelayedSubscriber(subscribers[subscribers.length - 1], new ResendLastOption(10), 12000);
        } else {
            streamTester.addSubscribers(subscribers);
        }
    }

    private StreamrClientWrapper[][] buildSharedKeyParticipants(String streamId, int nbJavaPublishers,
        int nbJavaSubscribers, int nbJSPublishers, int nbJSSubscribers) {
        UnencryptedGroupKey groupKey = StreamTester.generateGroupKey();

        StreamrClientWrapper[] publishers = new StreamrClientWrapper[nbJavaPublishers + nbJSPublishers];
        ArrayList<String> publisherIds = new ArrayList<>();
        for (int i = 0; i < nbJavaPublishers; i++) {
            StreamrClientJava p = buildEncryptedSigningClient(streamId, null, groupKey);
            publishers[i] = p;
            publisherIds.add(p.getAddress());
        }
        for (int i = nbJavaPublishers; i < nbJavaPublishers + nbJSPublishers; i++) {
            StreamrClientJS p = new StreamrClientJS(buildEncryptionOptions(streamId, null, groupKey));
            publishers[i] = p;
            publisherIds.add(p.getAddress());
        }
        StreamrClientWrapper[] subscribers = new StreamrClientWrapper[nbJavaSubscribers + nbJSSubscribers];
        for (int i = 0; i < nbJavaSubscribers; i++) {
            subscribers[i] = buildEncryptedSigningClient(streamId, publisherIds, groupKey);
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
    private StreamrClientJava buildEncryptedSigningClient(String streamId, ArrayList<String> publisherIds, UnencryptedGroupKey groupKey) {
        EncryptionOptions encryptionOptions = buildEncryptionOptions(streamId, publisherIds, groupKey);
        return new StreamrClientJava(new StreamrClient(new StreamrClientOptions(
                new EthereumAuthenticationMethod(StreamTester.generatePrivateKey()), SigningOptions.getDefault(),
                encryptionOptions, websocketApiUrl, restApiUrl)));
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
