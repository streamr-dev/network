package com.streamr.client_testing;

import com.streamr.client.StreamrClient;
import com.streamr.client.rest.Stream;

import java.util.Timer;
import java.util.TimerTask;
import java.util.function.BiConsumer;

public class PublisherThread{
    private final StreamrClient publisher;
    private final Timer timer;
    private TimerTask task;
    private final long interval;
    private long counter = 0;

    private PublisherThread(StreamrClient publisher, long interval) {
        this.publisher = publisher;
        timer = new Timer(true);
        this.interval = interval;
    }

    public StreamrClient getPublisher() {
        return publisher;
    }

    public PublisherThread(Stream stream, StreamrClient publisher, BiConsumer<StreamrClient, Stream> publishFunction, long interval) {
        this(publisher, interval);
        task = new TimerTask() {
            @Override
            public void run() {
                publishFunction.accept(publisher, stream);
            }
        };
    }
    public PublisherThread(Stream stream, StreamrClient publisher, PublishFunction publishFunction, long interval) {
        this(publisher, interval);
        task = new TimerTask() {
            @Override
            public void run() {
                counter++;
                publishFunction.apply(publisher, stream, counter);
            }
        };
    }

    public void start() {
        timer.schedule(task, 0, interval);
    }

    public void stop() {
        timer.cancel();
        publisher.disconnect();
    }

    @FunctionalInterface
    public interface PublishFunction {
        void apply(StreamrClient publisher, Stream stream, Long counter);
    }
}
