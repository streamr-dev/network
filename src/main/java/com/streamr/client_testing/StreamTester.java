package com.streamr.client_testing;

import com.squareup.moshi.JsonAdapter;
import com.streamr.client.MessageHandler;
import com.streamr.client.StreamrClient;
import com.streamr.client.authentication.EthereumAuthenticationMethod;
import com.streamr.client.exceptions.InvalidGroupKeyException;
import com.streamr.client.exceptions.UnableToDecryptException;
import com.streamr.client.options.EncryptionOptions;
import com.streamr.client.options.ResendOption;
import com.streamr.client.options.SigningOptions;
import com.streamr.client.options.StreamrClientOptions;
import com.streamr.client.protocol.message_layer.StreamMessage;
import com.streamr.client.rest.Stream;
import com.streamr.client.subs.Subscription;
import com.streamr.client.utils.HttpUtils;
import com.streamr.client.utils.UnencryptedGroupKey;
import okhttp3.*;
import org.apache.commons.codec.binary.Hex;
import org.apache.commons.lang.RandomStringUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
import org.json.simple.JSONObject;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.*;
import java.util.function.BiConsumer;

import static com.streamr.client.utils.HttpUtils.MOSHI;

public class StreamTester {
    private static final Logger log = LogManager.getLogger();
    private static SecureRandom secureRandom = new SecureRandom();
    private static final int NETWORK_SETUP_DELAY = 5000;

    private final StreamrClient creator;
    private final Stream stream;
    private final ArrayList<PublisherThread> publishers = new ArrayList<>();
    private final ArrayList<StreamrClient> subscribers = new ArrayList<>();
    private final boolean testCorrectness;
    private HashMap<String, ArrayDeque<String>> publishersMsgStacks = new HashMap<>(); // publisherId --> stack of serialized msg content
    private HashMap<String, HashMap<String, ArrayDeque<String>>> subscribersMsgStacks = new HashMap<>(); // publisherId --> (subscriberId --> stack of serialized msg content)
    private int decryptionErrorsCount = 0;

    public StreamTester(String streamName, String restApiUrl, String websocketApiUrl, boolean testCorrectness) {
        StreamrClientOptions options = new StreamrClientOptions(new EthereumAuthenticationMethod(generatePrivateKey()),
                SigningOptions.getDefault(), EncryptionOptions.getDefault(), websocketApiUrl, restApiUrl);
        this.creator = new StreamrClient(options);
        creator.connect();
        try {
            stream = creator.createStream(new Stream(streamName, ""));
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
        this.testCorrectness = testCorrectness;
    }

    private void addPublisher(PublisherThread thread) {
        grantPermission(stream, creator, thread.getPublisher().getPublisherId(), "read");
        grantPermission(stream, creator, thread.getPublisher().getPublisherId(), "write");
        thread.getPublisher().connect();
        publishers.add(thread);
        if (testCorrectness) {
            publishersMsgStacks.put(thread.getPublisher().getPublisherId(), new ArrayDeque<>());
            subscribersMsgStacks.put(thread.getPublisher().getPublisherId(), new HashMap<>());
        }
        System.out.println("Added publisher: " + thread.getPublisher().getPublisherId());
    }

    public void addPublisher(StreamrClient publisher, BiConsumer<StreamrClient, Stream> publishFunction, long interval) {
        addPublisher(new PublisherThread(stream, publisher, publishFunction, interval));
    }

    public void addPublisher(StreamrClient publisher, PublisherThread.PublishFunction publishFunction, long interval) {
        addPublisher(new PublisherThread(stream, publisher, publishFunction, interval));
    }

    public void addSubscriber(StreamrClient subscriber, ResendOption resendOption) {
        grantPermission(stream, creator, subscriber.getPublisherId(), "read");
        subscriber.connect();
        BiConsumer<Subscription, StreamMessage> onMsg = (testCorrectness && resendOption == null) ? (subscription, streamMessage) -> {
            System.out.println("Subscriber " + subscriber.getPublisherId() + " received: " + streamMessage.toJson());
            ArrayDeque<String> subscriberStack = subscribersMsgStacks.get(streamMessage.getPublisherId()).get(subscriber.getPublisherId());
            if (subscriberStack == null) {
                subscriberStack = new ArrayDeque<>();
                subscribersMsgStacks.get(streamMessage.getPublisherId()).put(subscriber.getPublisherId(), subscriberStack);
            }
            subscriberStack.addLast(streamMessage.getSerializedContent());
        } : (subscription, streamMessage) -> {};
        MessageHandler handler = new MessageHandler() {
            @Override
            public void onMessage(Subscription subscription, StreamMessage streamMessage) {
                onMsg.accept(subscription, streamMessage);
            }
            @Override
            public void onUnableToDecrypt(UnableToDecryptException e) {
                decryptionErrorsCount++;
                throw new RuntimeException(e);
            }
        };
        subscriber.subscribe(stream, 0, handler, resendOption);

        subscribers.add(subscriber);
        System.out.println("Added subscriber: " + subscriber.getPublisherId());
    }

    public void addDelayedSubscriber(StreamrClient subscriber, ResendOption resendOption, int delay) {
        Timer timer = new Timer(true);
        timer.schedule(new TimerTask() {
            @Override
            public void run() {
                addSubscriber(subscriber, resendOption);
            }
        }, NETWORK_SETUP_DELAY + delay);
    }

    public void addSubscribers(StreamrClient ... subscribers) {
        for (StreamrClient sub: subscribers) {
            addSubscriber(sub, null);
        }
    }

    public void start() {
        System.out.println("Going to start stream " + stream.getName() + "...\n");
        try {
            // this delay is needed between the moment subscribers are subscribed and publishers start publishing
            // because the nodes stream topology needs some time before it is fully formed.
            Thread.sleep(NETWORK_SETUP_DELAY);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
        for (PublisherThread p: publishers) {
            p.start();
        }
    }

    public void stop() {
        for (PublisherThread p: publishers) {
            p.stop();
        }
        try {
            // messages might still be propagated to subscribers
            Thread.sleep(5000);
        } catch (InterruptedException e) {
            e.printStackTrace();
        }
        for (StreamrClient s: subscribers) {
            s.disconnect();
        }
        creator.disconnect();
    }

    public String getStreamId() {
        return stream.getId();
    }

    public void checkMsgsCorrectness() {
        if (!testCorrectness) {
            throw new RuntimeException("Cannot check correctness of messages on this stream.");
        }
        int total = 0;
        for (String publisherId: publishersMsgStacks.keySet()) {
            ArrayDeque<String> pubStack = publishersMsgStacks.get(publisherId);
            ArrayList<ArrayDeque<String>> stacks = new ArrayList<>();
            stacks.add(pubStack);
            stacks.addAll(subscribersMsgStacks.get(publisherId).values());
            try {
                total += checkMsgs(stacks);
            } catch (IllegalStateException e) {
                System.out.println("\nFAILED: " + e.getMessage() + "\n");
                printMsgsReceived();
                System.exit(1);
            }

        }
        if (decryptionErrorsCount > 0) {
            System.out.println("FAILED: Got " + decryptionErrorsCount + " UnableToDecryptException(s)");
            System.exit(1);
        }
        System.out.println("PASSED. Checked all " + total + " messages.");
    }

    private void printMsgsReceived() {
        System.out.println("\n");
        for (String pub: subscribersMsgStacks.keySet()) {
            HashMap<String, ArrayDeque<String>> subs = subscribersMsgStacks.get(pub);
            int totalSent = publishersMsgStacks.get(pub).size();
            System.out.println("Msgs received from " + pub + " :\n");
            for (String sub: subs.keySet()) {
                System.out.println(sub + " received " + subs.get(sub).size() + " messages out of " + totalSent + ":");
                for (String m: subs.get(sub)) {
                    System.out.println(m);
                }
            }
            System.out.println();
        }
    }

    private int checkMsgs(ArrayList<ArrayDeque<String>> stacks) {
        int size0 = stacks.get(0).size();
        for (int i = 1; i < stacks.size(); i++) {
            int size = stacks.get(i).size();
            if (size != size0) {
                throw new IllegalStateException("Expected to receive " + size0 + " messages but received " + size);
            }
        }
        int nbMsgs = 0;
        for (int i = 0; i < size0; i++) {
            String content0 = stacks.get(0).pollFirst();
            nbMsgs++;
            for (int j = 1; j < stacks.size(); j++) {
                String content = stacks.get(j).pollFirst();
                if (!content0.equals(content)) {
                    throw new IllegalStateException("Expected " + content0 + " but received " + content);
                }
            }
        }
        return nbMsgs;
    }

    public BiConsumer<StreamrClient, Stream> getDefaultPublishFunction() {
        if (testCorrectness) {
            return (publisher, stream) -> {
                HashMap<String, Object> payload = genPayload();
                String payloadString = HttpUtils.mapAdapter.toJson(payload);
                // System.out.println("going to publish " + payloadString);
                publisher.publish(stream, payload);
                publishersMsgStacks.get(publisher.getPublisherId()).addLast(payloadString);
                // System.out.println("published " + payloadString);
            };
        } else {
            return (publisher, stream) -> publisher.publish(stream, genPayload());
        }
    }

    public PublisherThread.PublishFunction getRotatingPublishFunction() {
        if (testCorrectness) {
            return (publisher, stream, counter) -> {
                HashMap<String, Object> payload = genPayload();
                String payloadString = HttpUtils.mapAdapter.toJson(payload);
                System.out.println(publisher.getPublisherId() + ": going to publish " + payloadString);
                if (counter % 5 == 0) {
                    publisher.publish(stream, payload, new Date(), null, generateGroupKey());
                    counter = 0L;
                } else {
                    publisher.publish(stream, payload);
                }
                publishersMsgStacks.get(publisher.getPublisherId()).addLast(payloadString);
                System.out.println(publisher.getPublisherId() + ": published " + payloadString);
            };
        } else {
            return (publisher, stream, counter) -> {
                HashMap<String, Object> payload = genPayload();
                if (counter % 5 == 0) {
                    publisher.publish(stream, payload, new Date(), null, generateGroupKey());
                    counter = 0L;
                } else {
                    publisher.publish(stream, payload);
                }
            };
        }
    }

    public static UnencryptedGroupKey generateGroupKey() {
        byte[] keyBytes = new byte[32];
        secureRandom.nextBytes(keyBytes);
        try {
            return new UnencryptedGroupKey(Hex.encodeHexString(keyBytes), new Date());
        } catch (InvalidGroupKeyException e) {
            throw new RuntimeException(e);
        }
    }

    public static String generatePrivateKey() {
        byte[] array = new byte[32];
        new Random().nextBytes(array);
        return Hex.encodeHexString(array);
    }

    private static HashMap<String, Object> genPayload() {
        HashMap<String, Object> payload = new HashMap<>();
        payload.put("string-key", RandomStringUtils.randomAlphanumeric(10));
        payload.put("integer-key", secureRandom.nextInt(100));
        payload.put("double-key", secureRandom.nextDouble());
        int[] array = {12, 34, -4};
        payload.put("array-key", array);
        return payload;
    }

    // TODO: the following (needed to grant permissions) should be part of the StreamrClient library

    private static Request.Builder addAuthenticationHeader(Request.Builder builder, String sessionToken) {
        builder.removeHeader("Authorization");
        return builder.addHeader("Authorization", "Bearer " + sessionToken);
    }

    private static <T> T execute(Request request, JsonAdapter<T> adapter) throws IOException {
        OkHttpClient client = new OkHttpClient();

        // Execute the request and retrieve the response.
        Response response = client.newCall(request).execute();
        try {
            HttpUtils.assertSuccessful(response);

            // Deserialize HTTP response to concrete type.

            // System.out.println(response.body().string());
            return adapter == null ? null : adapter.fromJson(response.body().source());
        } finally {
            response.close();
        }
    }

    private static <T> T executeWithRetry(Request.Builder builder, JsonAdapter<T> adapter, String sessionToken) throws IOException {
        Request request = addAuthenticationHeader(builder, sessionToken).build();
        return execute(request, adapter);
    }

    private static <T> T get(HttpUrl url, JsonAdapter<T> adapter, String sessionToken) throws IOException {
        Request.Builder builder = new Request.Builder().url(url);
        return executeWithRetry(builder, adapter, sessionToken);
    }

    private static <T> T post(HttpUrl url, String requestBody, JsonAdapter<T> adapter, String sessionToken) throws IOException {
        Request.Builder builder = new Request.Builder()
                .url(url)
                .post(RequestBody.create(HttpUtils.jsonType, requestBody));
        return executeWithRetry(builder, adapter, sessionToken);
    }

    private static void grantPermission(Stream s, StreamrClient client, String userId, String operation) {
        HttpUrl url = HttpUrl.parse(client.getOptions().getRestApiUrl() + "/streams/" + s.getId() + "/permissions");
        HashMap<String, String> body = new HashMap<>();
        body.put("operation", operation);
        // body.put("anonymous", "true");
        body.put("user", userId);
        try {
            post(url, JSONObject.toJSONString(body), null, client.getSessionToken());
        } catch (IOException e) {
            e.printStackTrace();
        }
    }
}
