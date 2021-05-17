package com.streamr.client_testing;

import com.streamr.client.StreamrClient;
import com.streamr.client.rest.Stream;

public class PublishFunction {
    private final String name;
    private final Function f;

    public PublishFunction(String name, Function f) {
        this.name = name;
        this.f = f;
    }

    public String getName() {
        return name;
    }

    public Function getF() {
        return f;
    }

    @FunctionalInterface
    public interface Function {
        void apply(StreamrClient publisher, Stream stream, Long counter);
    }
}
