package com.streamr.client_testing;

public class Participants {
    private final int nbJavaPublishers;
    private final int nbJavaSubscribers;
    private final int nbJavascriptPublishers;
    private final int nbJavascriptSubscribers;
    private final int total;

    public Participants(int nbJavaPublishers, int nbJavaSubscribers, int nbJavascriptPublishers, int nbJavascriptSubscribers) {
        this.nbJavaPublishers = nbJavaPublishers;
        this.nbJavaSubscribers = nbJavaSubscribers;
        this.nbJavascriptPublishers = nbJavascriptPublishers;
        this.nbJavascriptSubscribers = nbJavascriptSubscribers;
        this.total = nbJavaPublishers + nbJavaSubscribers + nbJavascriptPublishers + nbJavascriptSubscribers;
    }

    public int getNbJavaPublishers() {
        return nbJavaPublishers;
    }

    public int getNbJavaSubscribers() {
        return nbJavaSubscribers;
    }

    public int getNbJavascriptPublishers() {
        return nbJavascriptPublishers;
    }

    public int getNbJavascriptSubscribers() {
        return nbJavascriptSubscribers;
    }

    public int getTotal() {
        return total;
    }
}
