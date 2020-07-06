package com.streamr.client_testing;

import com.streamr.client.rest.Stream;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.util.function.Consumer;

public class PublisherThreadJS extends PublisherThread {
    private final StreamrClientJS publisher;
    private Process p;
    private final String command;
    private Consumer<String> onPublished = null;
    private final Thread thread;
    private Thread errorLoggingThread;

    /**
     *
     * @param publisher
     * @param stream
     * @param publishFunction
     * @param interval I
     * @param maxMessages Number of messages to publish. Pass 0 for infinite.
     */
    public PublisherThreadJS(StreamrClientJS publisher, Stream stream, PublishFunction publishFunction, long interval, int maxMessages) {
        super(interval);
        this.publisher = publisher;
        // We assume there is only 1 key since we test only 1 stream
        String groupKey = "";
        if (publisher.getEncryptionOptions() != null) {
            groupKey = publisher.getEncryptionOptions().getPublisherGroupKeys().values().iterator().next().getGroupKeyHex();
        }

        command = String.format("node publisher.js %s %s %s %s %s %s",
                publisher.getPrivateKey(),
                stream.getId(),
                publishFunction.getName(),
                interval,
                maxMessages,
                groupKey
        );

        thread = new Thread(this::executeNode);
    }

    @Override
    public String getPublisherId() {
        return publisher.getAddress();
    }

    @Override
    public void setOnPublished(Consumer<String> onPublished) {
        this.onPublished = onPublished;
    }

    @Override
    public void start() {
        thread.start();
    }

    private void executeNode() {
        try {
            p = Runtime.getRuntime().exec(command);
            final BufferedReader stdInput = new BufferedReader(new
                    InputStreamReader(p.getInputStream()));

            final BufferedReader stdError = new BufferedReader(new
                    InputStreamReader(p.getErrorStream()));

            errorLoggingThread = new Thread(() -> {
                try {
                    String err;
                    while ((err = stdError.readLine()) != null) {
                        Main.logger.severe(getPublisherId() + " " + err);
                    }
                } catch (IOException e) {
                    e.printStackTrace();
                }
            });

            String s;
            while (!Thread.currentThread().isInterrupted() && (s = stdInput.readLine()) != null) {
                handleLine(s);
            }
            if (p.isAlive()) {
                p.destroy();
            }
            if (stdInput != null) {
                stdInput.close();
            }
            if (stdError != null) {
                stdError.close();
            }
        } catch (IOException e) {
            e.printStackTrace();
            System.exit(1);
        }
    }

    private void handleLine(String s) {
        // Handle the known things that publisher.js will log
        if (s.startsWith("Published: ")) {
            if (onPublished != null) {
                onPublished.accept(s.substring(12));
            }
        } else if (s.startsWith("Going to publish")) {
            Main.logger.finest(getPublisherId() + " " + s);
        } else if (s.startsWith("Rotating")) {
            Main.logger.info(getPublisherId() + " " + s);
        } else if (s.startsWith("Done: ")) {
            Main.logger.info(getPublisherId() + " " + s);
        } else {
            Main.logger.warning(getPublisherId() + " " + s);
        }
    }

    @Override
    public void stop() {
        thread.interrupt();
    }

    @Override
    public boolean isReady() {
        return !thread.isAlive();
    }
}
