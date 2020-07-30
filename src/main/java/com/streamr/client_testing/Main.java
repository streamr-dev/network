package com.streamr.client_testing;

import org.apache.commons.cli.*;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

public class Main {
    private static final Logger log = LogManager.getLogger(Main.class);

    public static void main(String[] args) {
        Options options = new Options();

        Option configFileOption = new Option("c", "config", true, "config file, default 'config/default.conf'");
        configFileOption.setRequired(false);
        options.addOption(configFileOption);

        String streamsDescription = "Stream setup to test or run. Must be one of:\n" + String.join("\n", Streams.SETUPS_NAMES);
        Option stream = new Option("s", "stream", true, streamsDescription);
        stream.setRequired(true);
        options.addOption(stream);

        Option mode = new Option("i", "infinite", false, "Run the test indefinitely");
        options.addOption(mode);

        Option maxMessagesOption = new Option("n", "number-of-messages", true, "Number of messages to publish in 'test' mode. Default: 30");
        options.addOption(maxMessagesOption);

        Option restApiUrl = new Option("r", "restUrl", true, "REST API url to connect to.");
        options.addOption(restApiUrl);

        Option wsApiUrl = new Option("w", "wsUrl", true, "WebSockets API url to connect to");
        options.addOption(wsApiUrl);

        CommandLineParser parser = new DefaultParser();
        HelpFormatter formatter = new HelpFormatter();
        CommandLine cmd = null;

        try {
            cmd = parser.parse(options, args);
        } catch (ParseException e) {
            formatter.printHelp("streamr-client-testing", options);
            System.exit(1);
        }

        String configFile = cmd.getOptionValue("config", "config/default.conf");
        System.out.println("Reading config from " + configFile);

        Properties prop = new Properties();
        try {
            InputStream in = new FileInputStream(configFile);
            prop.load(in);
            in.close();
        } catch (IOException e) {
            System.err.println("Unable to read config file: " + configFile);
            System.exit(1);
        }

        // Command-line options override config file
        String restUrl = cmd.getOptionValue("restUrl", prop.getProperty("restUrl"));
        String wsUrl = cmd.getOptionValue("wsUrl", prop.getProperty("wsUrl"));

        int minInterval = 800;
        int maxInterval = 2000;
        int maxMessages = Integer.parseInt(cmd.getOptionValue("number-of-messages", "30"));
        boolean testCorrectness = true;

        if (cmd.hasOption("infinite")) {
            maxMessages = 0;
            testCorrectness = false;
        }

        Participants participants = new Participants(
                Integer.parseInt(prop.getProperty("nbJavaPublishers")),
                Integer.parseInt(prop.getProperty("nbJavaSubscribers")),
                Integer.parseInt(prop.getProperty("nbJavascriptPublishers")),
                Integer.parseInt(prop.getProperty("nbJavascriptSubscribers"))
        );

        try {
            Streams streams = new Streams(participants, restUrl, wsUrl, minInterval, maxInterval, maxMessages, testCorrectness);
            streams.runTestBlocking(cmd.getOptionValue("stream"));
        } catch (Exception e) {
            log.fatal(e.getMessage(), e);
            System.exit(1);
        }
    }
}
