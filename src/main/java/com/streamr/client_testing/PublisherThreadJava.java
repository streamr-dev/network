package com.streamr.client_testing;

import com.streamr.client.StreamrClient;
import com.streamr.client.rest.Stream;

import java.util.Timer;
import java.util.TimerTask;
import java.util.function.Consumer;

public class PublisherThreadJava extends PublisherThread {
    private final StreamrClient publisher;
    private final Timer timer;
    private TimerTask task;
    private long counter = 0;

    public PublisherThreadJava(Stream stream, StreamrClient publisher, PublishFunction publishFunction, long interval) {
        super(interval);
        this.publisher = publisher;
        this.publisher.connect();
        timer = new Timer(true);
        task = new TimerTask() {
            @Override
            public void run() {
                counter++;
                publishFunction.getF().apply(publisher, stream, counter);
            }
        };
    }

    @Override
    public String getPublisherId() {
        return publisher.getPublisherId();
    }

    @Override
    public long getInterval() {
        return interval;
    }

    @Override
    public void setOnPublished(Consumer<String> onPublished) {

    }

    @Override
    public void start() {
        timer.schedule(task, 5000, interval);
    }

    @Override
    public void stop() {
        timer.cancel();
        publisher.disconnect();
    }
}
