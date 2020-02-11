package com.streamr.client_testing;

import com.streamr.client.StreamrClient;
import com.streamr.client.rest.Stream;

import java.util.Timer;
import java.util.TimerTask;
import java.util.function.BiConsumer;

public class PublisherThreadJava extends PublisherThread {
    private final StreamrClient publisher;
    private final Timer timer;
    private TimerTask task;
    private final long interval;
    private long counter = 0;

    private PublisherThreadJava(StreamrClient publisher, long interval) {
        this.publisher = publisher;
        this.publisher.connect();
        timer = new Timer(true);
        this.interval = interval;
    }

    public StreamrClient getPublisher() {
        return publisher;
    }

    public PublisherThreadJava(Stream stream, StreamrClient publisher, BiConsumer<StreamrClient, Stream> publishFunction, long interval) {
        this(publisher, interval);
        task = new TimerTask() {
            @Override
            public void run() {
                publishFunction.accept(publisher, stream);
            }
        };
    }
    public PublisherThreadJava(Stream stream, StreamrClient publisher, PublishFunction publishFunction, long interval) {
        this(publisher, interval);
        task = new TimerTask() {
            @Override
            public void run() {
                counter++;
                publishFunction.apply(publisher, stream, counter);
            }
        };
    }

    @Override
    public String getPublisherId() {
        return publisher.getPublisherId();
    }

    @Override
    public void start() {
        timer.schedule(task, 0, interval);
    }

    @Override
    public void stop() {
        timer.cancel();
        publisher.disconnect();
    }

    @FunctionalInterface
    public interface PublishFunction {
        void apply(StreamrClient publisher, Stream stream, Long counter);
    }
}
