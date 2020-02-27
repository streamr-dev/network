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
import org.json.simple.JSONObject;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.BiConsumer;

public class StreamTester {
    private static SecureRandom secureRandom = new SecureRandom();
    private static Random random = new Random();
    private static final int NETWORK_SETUP_DELAY = 5000;

    private final StreamrClient creator;
    private final Stream stream;
    private final ArrayList<PublisherThread> publishers = new ArrayList<>();
    private final ArrayList<Subscriber> subscribers = new ArrayList<>();
    private final boolean testCorrectness;
    private ConcurrentHashMap<String, ArrayDeque<String>> publishersMsgStacks = new ConcurrentHashMap<>(); // publisherId --> stack of serialized msg content
    private ConcurrentHashMap<String, ConcurrentHashMap<String, ArrayDeque<String>>> subscribersMsgStacks = new ConcurrentHashMap<>(); // publisherId --> (subscriberId --> stack of serialized msg content)
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

    public void addPublishers(PublishFunction publishFunction,
                              long minInterval, long maxInterval, StreamrClientWrapper ... publishers) {
        for (StreamrClientWrapper pub: publishers) {
            addPublisher(pub, publishFunction, getInterval(minInterval, maxInterval));
        }
    }

    public void addSubscriber(StreamrClientWrapper subscriber, ResendOption resendOption) {
        if (subscriber instanceof StreamrClientJava) {
            addJavaSubscriber((StreamrClientJava) subscriber, resendOption);
        } else if (subscriber instanceof StreamrClientJS) {
            addJavascriptSubscriber((StreamrClientJS) subscriber, resendOption);
        }
    }

    public void addDelayedSubscriber(StreamrClientWrapper subscriber, ResendOption resendOption, int delay) {
        if (subscriber instanceof StreamrClientJava) {
            addDelayedJavaSubscriber((StreamrClientJava) subscriber, resendOption, delay);
        } else if (subscriber instanceof StreamrClientJS) {
            addDelayedJavascriptSubscriber((StreamrClientJS) subscriber, resendOption, delay);
        }
    }

    public void addSubscribers(StreamrClientWrapper ... subscribers) {
        for (StreamrClientWrapper sub: subscribers) {
            if (sub instanceof StreamrClientJava) {
                addJavaSubscriber((StreamrClientJava) sub, null);
            } else if (sub instanceof StreamrClientJS) {
                addJavascriptSubscriber((StreamrClientJS) sub, null);
            }
        }
    }

    public void start() {
        Main.logger.info("Starting stream " + stream.getName() + "...\n");
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
        for (Subscriber s: subscribers) {
            s.stop();
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
            stacks.add(new ArrayDeque<>(pubStack));
            for (ArrayDeque<String> s: subscribersMsgStacks.get(publisherId).values()) {
                stacks.add(new ArrayDeque<>(s));
            }
            try {
                total += checkMsgs(stacks);
            } catch (IllegalStateException e) {
                Main.logger.warning("\nFAILED. On error: '" + e.getMessage() + "'\n");
                printMsgsReceived();
                System.exit(1);
            }

        }
        if (decryptionErrorsCount > 0) {
            Main.logger.warning("FAILED. Got " + decryptionErrorsCount + " UnableToDecryptException(s)");
            System.exit(1);
        }
        Main.logger.info("PASSED. Checked all " + total + " messages.");
    }

    private void printMsgsReceived() {
        System.out.println("\n");
        for (String pub: subscribersMsgStacks.keySet()) {
            ConcurrentHashMap<String, ArrayDeque<String>> subs = subscribersMsgStacks.get(pub);
            int totalSent = publishersMsgStacks.get(pub).size();
            System.out.println(totalSent + " msgs sent by " + pub + ":\n");
            for (String m: publishersMsgStacks.get(pub)) {
                System.out.println(m);
            }
            System.out.println("\nMsgs received from " + pub + " :\n");
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

    private void addPublisher(StreamrClientWrapper publisher, PublishFunction publishFunction, long interval) {
        PublisherThread thread = publisher.toPublisherThread(stream, publishFunction, interval);
        if (testCorrectness) {
            thread.setOnPublished((payloadString) -> {
                publishersMsgStacks.get(thread.getPublisherId()).addLast(payloadString);
                Main.logger.fine(thread.getPublisherId() + " published " + payloadString);
            });
        }
        grantPermission(stream, creator, thread.getPublisherId(), "read");
        grantPermission(stream, creator, thread.getPublisherId(), "write");
        publishers.add(thread);
        if (testCorrectness) {
            publishersMsgStacks.put(thread.getPublisherId(), new ArrayDeque<>());
            subscribersMsgStacks.put(thread.getPublisherId(), new ConcurrentHashMap<>());
        }
        Main.logger.info("Added " + publisher.getImplementation() + " publisher: " + thread.getPublisherId() +
                " (publication rate in milliseconds: " + thread.getInterval() + ")");
    }

    private void addJavaSubscriber(StreamrClientJava subscriber, ResendOption resendOption) {
        String subscriberId = subscriber.getAddress();
        BiConsumer<Subscription, StreamMessage> onMsg = (testCorrectness && resendOption == null) ?
                (subscription, streamMessage) -> onReceivedJava(subscriberId, streamMessage) :
                (subscription, streamMessage) -> {};
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
        SubscriberJava subscriberJava = new SubscriberJava(subscriber.getStreamrClient(), () -> subscriber.getStreamrClient().subscribe(stream, 0, handler, resendOption));
        addSubscriber(subscriberJava, "Java", resendOption);
    }

    private void addJavascriptSubscriber(StreamrClientJS subscriber, ResendOption resendOption) {
        SubscriberJS subscriberJS = new SubscriberJS(subscriber, stream, resendOption);
        if (testCorrectness && resendOption == null) {
            subscriberJS.setOnReceived((publisherId, content) -> onReceivedJavascript(subscriberJS, publisherId, content));
        }
        addSubscriber(subscriberJS, "Javascript", resendOption);
    }

    private synchronized void onReceivedJava(String subscriberId, StreamMessage streamMessage) {
        Main.logger.info("Java subscriber " + subscriberId + " received: " + streamMessage.toJson());
        ArrayDeque<String> subscriberStack = subscribersMsgStacks.get(streamMessage.getPublisherId().toLowerCase()).get(subscriberId);
        if (subscriberStack == null) {
            subscriberStack = new ArrayDeque<>();
            subscribersMsgStacks.get(streamMessage.getPublisherId().toLowerCase()).put(subscriberId, subscriberStack);
        }
        subscriberStack.addLast(streamMessage.getSerializedContent());
    }

    private synchronized void onReceivedJavascript(SubscriberJS subscriberJS, String publisherId, String content) {
        // logging is in subscriber.js and SubscriberJS.java
        ArrayDeque<String> subscriberStack = subscribersMsgStacks.get(publisherId.toLowerCase()).get(subscriberJS.getSubscriberId());
        if (subscriberStack == null) {
            subscriberStack = new ArrayDeque<>();
            subscribersMsgStacks.get(publisherId.toLowerCase()).put(subscriberJS.getSubscriberId(), subscriberStack);
        }
        subscriberStack.addLast(content);
    }

    private void addSubscriber(Subscriber subscriber, String implementation, ResendOption resendOption) {
        grantPermission(stream, creator, subscriber.getSubscriberId(), "read");
        subscriber.start();
        subscribers.add(subscriber);
        if (testCorrectness && resendOption == null) {
            subscribersMsgStacks.values().forEach(map -> map.put(subscriber.getSubscriberId(), new ArrayDeque<>()));
        }
        Main.logger.info("Added " + implementation + " subscriber: " + subscriber.getSubscriberId());
    }

    private void addDelayedJavaSubscriber(StreamrClientJava subscriber, ResendOption resendOption, int delay) {
        Timer timer = new Timer(true);
        timer.schedule(new TimerTask() {
            @Override
            public void run() {
                addJavaSubscriber(subscriber, resendOption);
            }
        }, NETWORK_SETUP_DELAY + delay);
    }

    private void addDelayedJavascriptSubscriber(StreamrClientJS subscriber, ResendOption resendOption, int delay) {
        Timer timer = new Timer(true);
        timer.schedule(new TimerTask() {
            @Override
            public void run() {
                addJavascriptSubscriber(subscriber, resendOption);
            }
        }, NETWORK_SETUP_DELAY + delay);
    }

    public PublishFunction getDefaultPublishFunction() {
        PublishFunction.Function f;
        if (testCorrectness) {
            f = (publisher, stream, counter) -> {
                synchronized (this) {
                    HashMap<String, Object> payload = genPayload();
                    String payloadString = HttpUtils.mapAdapter.toJson(payload);
                    Main.logger.finest(publisher.getPublisherId() + " going to publish " + payloadString);
                    publisher.publish(stream, payload);
                    publishersMsgStacks.get(publisher.getPublisherId()).addLast(payloadString);
                    Main.logger.fine(publisher.getPublisherId() + " published " + payloadString);
                }
            };
        } else {
            f = (publisher, stream, counter) -> publisher.publish(stream, genPayload());
        }
        return new PublishFunction("default", f);
    }

    public PublishFunction getRotatingPublishFunction(int nbMessagesForSingleKey) {
        PublishFunction.Function f;
        if (testCorrectness) {
            f = (publisher, stream, counter) -> {
                synchronized (this) {
                    HashMap<String, Object> payload = genPayload();
                    String payloadString = HttpUtils.mapAdapter.toJson(payload);
                    Main.logger.finest(publisher.getPublisherId() + " going to publish " + payloadString);
                    if (counter % nbMessagesForSingleKey == 0) {
                        UnencryptedGroupKey newKey = generateGroupKey();
                        Main.logger.fine(publisher.getPublisherId() + " rotating the key. New key: " + newKey.getGroupKeyHex());
                        publisher.publish(stream, payload, new Date(), null, newKey);
                        counter = 0L;
                    } else {
                        publisher.publish(stream, payload);
                    }
                    publishersMsgStacks.get(publisher.getPublisherId()).addLast(payloadString);
                    Main.logger.fine(publisher.getPublisherId() + ": published " + payloadString);
                }
            };
        } else {
            f = (publisher, stream, counter) -> {
                synchronized (this) {
                    HashMap<String, Object> payload = genPayload();
                    if (counter % nbMessagesForSingleKey == 0) {
                        publisher.publish(stream, payload, new Date(), null, generateGroupKey());
                        counter = 0L;
                    } else {
                        publisher.publish(stream, payload);
                    }
                }
            };
        }
        return new PublishFunction("rotating", f);
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
        payload.put("client-implementation", "Java");
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

    private long getInterval(long minInterval, long maxInterval) {
        long diff = maxInterval - minInterval;
        // publication intervals in millis should always be reasonably small so we can cast them to int
        return random.nextInt((int)diff) + minInterval;
    }
}
