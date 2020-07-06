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
    boolean ready = false;

    public PublisherThreadJava(Stream stream, StreamrClient publisher, PublishFunction publishFunction, long interval, final int maxMessages) {
        super(interval);
        this.publisher = publisher;
        this.publisher.connect();
        timer = new Timer(true);
        task = new TimerTask() {
            @Override
            public void run() {
                counter++;
                publishFunction.getF().apply(publisher, stream, counter);
                if (counter > 0 && counter >= maxMessages) {
                    Main.logger.info(publisher.getPublisherId() + " Done: All " + maxMessages + " messages published. Quitting Java publisher.");
                    stop();
                }
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
