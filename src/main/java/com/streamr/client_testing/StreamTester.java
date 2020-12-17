package com.streamr.client_testing;

import com.streamr.client.MessageHandler;
import com.streamr.client.StreamrClient;
import com.streamr.client.authentication.EthereumAuthenticationMethod;
import com.streamr.client.exceptions.UnableToDecryptException;
import com.streamr.client.options.EncryptionOptions;
import com.streamr.client.options.ResendOption;
import com.streamr.client.options.SigningOptions;
import com.streamr.client.options.StreamrClientOptions;
import com.streamr.client.protocol.message_layer.StreamMessage;
import com.streamr.client.rest.Permission;
import com.streamr.client.rest.Stream;
import com.streamr.client.subs.Subscription;
import com.streamr.client.utils.Address;
import com.streamr.client.utils.GroupKey;
import com.streamr.client.utils.HttpUtils;
import org.apache.commons.codec.binary.Hex;
import org.apache.commons.lang.RandomStringUtils;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

public class StreamTester {
    private static final Logger log = LogManager.getLogger(StreamTester.class);

    private static final SecureRandom secureRandom = new SecureRandom();
    private static final Random random = new Random();
    private static final int NETWORK_SETUP_DELAY = 5000;
    private static final int NETWORK_PROPAGATION_DELAY = 2000;

    private final StreamrClient creator;
    private final Stream stream;
    private final ArrayList<PublisherThread> publishers = new ArrayList<>();
    private final ArrayList<Subscriber> subscribers = new ArrayList<>();
    private final boolean testCorrectness;
    private final int minInterval;
    private final int maxInterval;
    private final int maxMessages;
    private final ConcurrentHashMap<Address, ArrayDeque<String>> publishersMsgStacks = new ConcurrentHashMap<>(); // publisherId --> stack of serialized msg content
    private final ConcurrentHashMap<Address, ConcurrentHashMap<Address, ArrayDeque<String>>> subscribersMsgStacks = new ConcurrentHashMap<>(); // publisherId --> (subscriberId --> stack of serialized msg content)
    private int decryptionErrorsCount = 0;

    public StreamTester(String streamName, String restApiUrl, String websocketApiUrl, int minInterval, int maxInterval, int maxMessages, boolean testCorrectness) {
        StreamrClientOptions options = new StreamrClientOptions(new EthereumAuthenticationMethod(generatePrivateKey()),
                SigningOptions.getDefault(), EncryptionOptions.getDefault(), websocketApiUrl, restApiUrl);
        this.creator = new StreamrClient(options);
        try {
            stream = creator.createStream(new Stream(streamName, ""));
        } catch (IOException e) {
            throw new RuntimeException(e);
        }
        this.minInterval = minInterval;
        this.maxInterval = maxInterval;
        this.maxMessages = maxMessages;
        this.testCorrectness = testCorrectness;
    }

    public void addPublishers(PublishFunction publishFunction, StreamrClientWrapper ... publishers) {
        for (StreamrClientWrapper pub: publishers) {
            addPublisher(pub, publishFunction, getInterval(minInterval, maxInterval), maxMessages);
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
        log.info("Starting stream {}...\n", stream.getName());
        try {
            // this delay is needed between the moment subscribers are subscribed and publishers start publishing
            // because the nodes stream topology needs some time before it is fully formed.
            log.info("Giving subscribers {} ms to subscribe before starting to publish...", NETWORK_SETUP_DELAY);
            Thread.sleep(NETWORK_SETUP_DELAY);
        } catch (InterruptedException ignored) {}
        for (PublisherThread p: publishers) {
            p.start();
        }
    }

    public void stop() {
        log.info("Stopping test {}", stream.getName());
        for (PublisherThread p: publishers) {
            p.stop();
        }
        // Give subscribers some time to receive the last messages
        try {
            Thread.sleep(NETWORK_PROPAGATION_DELAY);
        } catch (InterruptedException ignored) {}

        for (Subscriber s: subscribers) {
            s.stop();
        }
    }

    public boolean arePublishersReady() {
        long publishersNotReady = publishers.stream().filter(p -> !p.isReady()).count();
        return publishersNotReady == 0;
    }

    public String getStreamId() {
        return stream.getId();
    }

    public void checkMsgsCorrectness() {
        if (!testCorrectness) {
            throw new RuntimeException("Cannot check correctness of messages on this stream.");
        }
        int totalPublished = 0;
        int totalReceived = 0;
        for (Address publisherId: publishersMsgStacks.keySet()) {
            ArrayDeque<String> pubStack = publishersMsgStacks.get(publisherId);

            if (maxMessages != 0 && pubStack.size() != maxMessages) {
                log.warn("\nExpected {} to publish {} messages but published {}\n", publisherId.toString(), maxMessages, pubStack.size());
            }

            totalPublished += pubStack.size();

            try {
                totalReceived += checkMsgs(publisherId, pubStack);
            } catch (IllegalStateException e) {
                printMsgsReceived();
                log.error("\nFAILED test {}. On error: '{}'\n", stream.getName(), e.getMessage());
                System.exit(1);
            }

        }
        if (decryptionErrorsCount > 0) {
            log.error("\nFAILED. Got {} UnableToDecryptException(s)\n", decryptionErrorsCount);
            System.exit(1);
        }

        if (totalReceived == 0) {
            printMsgsReceived();
            log.error("\nFAILED. Published {} messages but received {} messages.\n", totalPublished, totalReceived);
            System.exit(1);
        }

        log.info("\nPASSED. Checked all {} published and {} received messages.\n", totalPublished, totalReceived);
        System.exit(0);
    }

    private void printMsgsReceived() {
        System.out.println("\n");
        log.debug(subscribersMsgStacks.toString());
        for (Address pub: subscribersMsgStacks.keySet()) {
            ConcurrentHashMap<Address, ArrayDeque<String>> subs = subscribersMsgStacks.get(pub);
            int totalSent = publishersMsgStacks.get(pub).size();
            System.out.println(totalSent + " msgs sent by " + pub + ":\n");
            for (String m: publishersMsgStacks.get(pub)) {
                System.out.println(m);
            }

            boolean didPrintHeader = false;

            for (Address sub: subs.keySet()) {
                // Only log incorrect reception:
                if (subs.get(sub).size() != totalSent) {
                    // log header once
                    if (!didPrintHeader) {
                        didPrintHeader = true;
                        System.out.println("\nMsgs received from " + pub + " :\n");
                    }
                    System.out.println(sub + " received " + subs.get(sub).size() + " messages out of " + totalSent + ":");
                    for (String m : subs.get(sub)) {
                        System.out.println(m);
                    }
                }
            }
            System.out.println();
            System.out.flush();
        }
    }

    private int checkMsgs(Address publisherId, ArrayDeque<String> pubStack) {
        int publishedMessagesCount = pubStack.size();
        ArrayList<ArrayDeque<String>> subStacks = new ArrayList<>();
        // Check that every subscriber received the correct number of messages from this publisher
        for (Map.Entry<Address, ArrayDeque<String>> entry : subscribersMsgStacks.get(publisherId).entrySet()) {
            String subId = entry.getKey().toString();
            ArrayDeque<String> subStack = new ArrayDeque<String>(entry.getValue());
            int size = subStack.size();
            if (size < publishedMessagesCount) {
                throw new IllegalStateException("Expected " + subId + "to receive " + publishedMessagesCount + " messages from " + publisherId + ", but received " + size);
            } else if (size != publishedMessagesCount) {
                // Receiving ~one message more than counted can happen due to a race condition. Not an error but let's log a warning
                log.warn("Expected {} to receive {} messages from {}, but received {}", subId, publishedMessagesCount, publisherId, size);
                log.warn("This could happen due to a race condition in publishing vs. stopping the publisher. Probably not an issue, but logging it anyway.");
            }
            // Check that every subscriber received the correct content of messages from this publisher
            for (String publishedMessage : pubStack) {
                String receivedMessage = subStack.pollFirst();
                if (!publishedMessage.equals(receivedMessage)) {
                    throw new IllegalStateException("Expected "+ subId + " to get " + publishedMessage + " but received " + receivedMessage);
                }
            }
        }

        return subStacks.size() * pubStack.size(); // total received messages
    }

    private void addPublisher(StreamrClientWrapper publisher, PublishFunction publishFunction, long interval, int maxMessages) {
        PublisherThread thread = publisher.toPublisherThread(stream, publishFunction, interval, maxMessages);
        if (testCorrectness) {
            thread.setOnPublished((payloadString) -> {
                publishersMsgStacks.get(thread.getPublisherId()).addLast(payloadString);
                log.debug("{} published {}", thread.getPublisherId(), payloadString);
            });
        }

        try {
            creator.grant(stream, Permission.Operation.stream_get, thread.getPublisherId().toString());
            creator.grant(stream, Permission.Operation.stream_publish, thread.getPublisherId().toString());
        } catch (Exception e) {
            throw new RuntimeException(String.format("Failed to grant permissions on stream %s to publisher %s",
                    stream.getId(), thread.getPublisherId()));
        }

        publishers.add(thread);
        if (testCorrectness) {
            publishersMsgStacks.put(thread.getPublisherId(), new ArrayDeque<>());
            subscribersMsgStacks.put(thread.getPublisherId(), new ConcurrentHashMap<>());
        }
        log.info("Added {} publisher: {} (publication rate in milliseconds: {})",
                        publisher.getImplementation(), thread.getPublisherId(), thread.getInterval());
    }

    private void addJavaSubscriber(StreamrClientJava subscriber, ResendOption resendOption) {
        MessageHandler handler = new MessageHandler() {
            @Override
            public void onMessage(Subscription subscription, StreamMessage streamMessage) {
                if (testCorrectness) {
                    onReceivedJava(subscriber.getAddress(), streamMessage);
                }
            }
            @Override
            public void onUnableToDecrypt(UnableToDecryptException e) {
                decryptionErrorsCount++;
                log.error("onUnableToDecrypt called", e);
                throw new RuntimeException(e);
            }
        };
        SubscriberJava subscriberJava = new SubscriberJava(subscriber.getStreamrClient(), handler, stream, resendOption);
        addSubscriber(subscriberJava, "Java");
    }

    private void addJavascriptSubscriber(StreamrClientJS subscriber, ResendOption resendOption) {
        SubscriberJS subscriberJS = new SubscriberJS(subscriber, stream, resendOption);
        if (testCorrectness) {
            subscriberJS.setOnReceived((publisherId, content) -> onReceivedJavascript(subscriberJS, publisherId, content));
        }
        addSubscriber(subscriberJS, "Javascript");
    }

    private synchronized void onReceivedJava(Address subscriberId, StreamMessage streamMessage) {
        log.debug("Java subscriber {} received: {}", subscriberId, streamMessage.serialize());
        ArrayDeque<String> subscriberStack = subscribersMsgStacks.get(streamMessage.getPublisherId()).get(subscriberId);
        if (subscriberStack == null) {
            subscriberStack = new ArrayDeque<>();
            subscribersMsgStacks.get(streamMessage.getPublisherId()).put(subscriberId, subscriberStack);
        }
        subscriberStack.addLast(streamMessage.getSerializedContent());
    }

    private synchronized void onReceivedJavascript(SubscriberJS subscriberJS, Address publisherId, String content) {
        // logging is in subscriber.js and SubscriberJS.java
        ArrayDeque<String> subscriberStack = subscribersMsgStacks.get(publisherId).get(subscriberJS.getSubscriberId());
        if (subscriberStack == null) {
            subscriberStack = new ArrayDeque<>();
            subscribersMsgStacks.get(publisherId).put(subscriberJS.getSubscriberId(), subscriberStack);
        }
        subscriberStack.addLast(content);
    }

    private void addSubscriber(Subscriber subscriber, String implementation) {
        try {
            creator.grant(stream, Permission.Operation.stream_get, subscriber.getSubscriberId().toString());
            creator.grant(stream, Permission.Operation.stream_subscribe, subscriber.getSubscriberId().toString());
        } catch (Exception e) {
            throw new RuntimeException(String.format("Failed to grant permissions on %s to subscriber %s",
                    stream.getId(), subscriber.getSubscriberId()));
        }

        subscriber.start();
        subscribers.add(subscriber);
        if (testCorrectness) {
            subscribersMsgStacks.values().forEach(map -> map.put(subscriber.getSubscriberId(), new ArrayDeque<>()));
        }
        log.info("Added {} subscriber: {}", implementation, subscriber.getSubscriberId());
    }

    private void addDelayedJavaSubscriber(StreamrClientJava subscriber, ResendOption resendOption, int delay) {
        Timer timer = new Timer(true);
        timer.schedule(new TimerTask() {
            @Override
            public void run() {
                addJavaSubscriber(subscriber, resendOption);
            }
        }, NETWORK_SETUP_DELAY + delay);
        log.info("Added delayed Java subscriber with resend. Delay: {}", delay);
    }

    private void addDelayedJavascriptSubscriber(StreamrClientJS subscriber, ResendOption resendOption, int delay) {
        Timer timer = new Timer(true);
        timer.schedule(new TimerTask() {
            @Override
            public void run() {
                addJavascriptSubscriber(subscriber, resendOption);
            }
        }, NETWORK_SETUP_DELAY + delay);
        log.info("Added delayed JS subscriber with resend. Delay: {}", delay);
    }

    public PublishFunction getDefaultPublishFunction() {
        PublishFunction.Function f = (publisher, stream, counter) -> {
            synchronized (this) {
                HashMap<String, Object> payload = genPayload(counter);
                String payloadString = HttpUtils.mapAdapter.toJson(payload);
                log.trace("{} going to publish {}", publisher.getPublisherId(), payloadString);
                publisher.publish(stream, payload);

                if (testCorrectness) {
                    publishersMsgStacks.get(publisher.getPublisherId()).addLast(payloadString);
                }
                log.debug("{} published {}", publisher.getPublisherId(), payloadString);
            }
        };
        return new PublishFunction("default", f);
    }

    public PublishFunction getRotatingPublishFunction(int nbMessagesForSingleKey) {
        PublishFunction.Function f = (publisher, stream, counter) -> {
            synchronized (this) {
                HashMap<String, Object> payload = genPayload(counter);
                String payloadString = HttpUtils.mapAdapter.toJson(payload);
                log.trace("{} going to publish {}", publisher.getPublisherId(), payloadString);
                if (counter % nbMessagesForSingleKey == 0) {
                    GroupKey newKey = GroupKey.generate();
                    log.debug("{} rotating the key. New key: {}", publisher.getPublisherId(), newKey.getGroupKeyHex());
                    publisher.publish(stream, payload, new Date(), null, newKey);
                } else {
                    publisher.publish(stream, payload);
                }

                if (testCorrectness) {
                    publishersMsgStacks.get(publisher.getPublisherId()).addLast(payloadString);
                }
                log.debug("{} published {}", publisher.getPublisherId(), payloadString);
            }
        };
        return new PublishFunction("rotating", f);
    }

    public PublishFunction getRotatingRevokingPublishFunction(int nbMessagesForSingleKey, int nbMessagesBetweenRevokes) {
        PublishFunction.Function f = (publisher, stream, counter) -> {
                synchronized (this) {
                    HashMap<String, Object> payload = genPayload(counter);
                    String payloadString = HttpUtils.mapAdapter.toJson(payload);
                    log.trace("{} going to publish {}", publisher.getPublisherId(), payloadString);
                    if (counter % nbMessagesBetweenRevokes == 0) {
                        log.debug("{} revoking with a rekey...", publisher.getPublisherId());
                        publisher.rekey(stream);
                        log.debug("{} revoked with a rekey.", publisher.getPublisherId());
                        publisher.publish(stream, payload);
                    } else if (counter % nbMessagesForSingleKey == 0) {
                        GroupKey newKey = GroupKey.generate();
                        log.debug("{} rotating the key. New key: {}", publisher.getPublisherId(), newKey.getGroupKeyHex());
                        publisher.publish(stream, payload, new Date(), null, newKey);
                    } else {
                        publisher.publish(stream, payload);
                    }

                    if (testCorrectness) {
                        publishersMsgStacks.get(publisher.getPublisherId()).addLast(payloadString);
                    }
                    log.debug("{} published {}", publisher.getPublisherId(), payloadString);
                }
            };
        return new PublishFunction("rotating", f);
    }

    public static String generatePrivateKey() {
        byte[] array = new byte[32];
        new Random().nextBytes(array);
        return Hex.encodeHexString(array);
    }

    private static HashMap<String, Object> genPayload(long counter) {
        HashMap<String, Object> payload = new HashMap<>();
        payload.put("counter", counter);
        payload.put("client-implementation", "Java");
        payload.put("string-key", RandomStringUtils.randomAlphanumeric(10));
        payload.put("integer-key", secureRandom.nextInt(100));
        payload.put("double-key", secureRandom.nextDouble());
        int[] array = {12, 34, -4};
        payload.put("array-key", array);
        return payload;
    }

    private long getInterval(long minInterval, long maxInterval) {
        long diff = maxInterval - minInterval;
        // publication intervals in millis should always be reasonably small so we can cast them to int
        return random.nextInt((int)diff) + minInterval;
    }
}
