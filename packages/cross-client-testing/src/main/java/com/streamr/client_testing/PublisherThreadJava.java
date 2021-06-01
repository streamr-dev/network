package com.streamr.client_testing;

import com.streamr.client.StreamrClient;
import com.streamr.client.rest.Stream;
import com.streamr.client.utils.Address;
import com.streamr.client.utils.GroupKey;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.util.Timer;
import java.util.TimerTask;
import java.util.function.Consumer;

public class PublisherThreadJava extends PublisherThread {
    private static final Logger log = LogManager.getLogger(PublisherThreadJava.class);

    private final StreamrClient publisher;
    private final Timer timer;
    private TimerTask task;
    private long counter = 0;
    boolean ready = false;

    public PublisherThreadJava(Stream stream, StreamrClient publisher, PublishFunction publishFunction, long interval, final int maxMessages) {
        super(interval);
        this.publisher = publisher;
        this.publisher.connect();

        timer = new Timer("Java-pub-" + getPublisherId().toString().substring(0, 6), true);
        task = new TimerTask() {
            @Override
            public void run() {
                long currentCounter = counter++;
                publishFunction.getF().apply(publisher, stream, currentCounter);
                if (currentCounter > 0 && currentCounter >= maxMessages) {
                    log.info("Publisher {} done: All {} messages published.",
                            publisher.getPublisherId(), maxMessages);
                    ready = true;
                    timer.cancel();
                }
            }
        };
    }

    @Override
    public Address getPublisherId() {
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
        timer.schedule(task, 0, interval);
    }

    @Override
    public void stop() {
        timer.cancel();
        publisher.disconnect();
        ready = true;
    }

    @Override
    public boolean isReady() {
        return ready;
    }
}
