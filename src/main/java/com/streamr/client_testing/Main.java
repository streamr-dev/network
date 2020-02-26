package com.streamr.client_testing;

import org.apache.commons.cli.*;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;

public class Main {
    private static Streams streams;
    public static void main(String[] args) {
        Properties prop = new Properties();
        try {
            InputStream in = new FileInputStream("application.conf");
            prop.load(in);
            in.close();
        } catch (IOException e) {
            e.printStackTrace();
        }

        Options options = new Options();

        String streamsDescription = "Stream setup to test or run. Must be one of:\n" + String.join("\n", Streams.SETUPS_NAMES);
        Option stream = new Option("s", "stream", true, streamsDescription);
        stream.setRequired(true);
        options.addOption(stream);

        Option mode = new Option("m", "mode", true, "'test' or 'run'");
        mode.setRequired(true);
        options.addOption(mode);

        String restUrl = prop.getProperty("restUrl");
        Option restApiUrl = new Option("r", "resturl", true, "REST API url to connect to.");
        options.addOption(restApiUrl);

        String wsUrl = prop.getProperty("wsUrl");
        Option wsApiUrl = new Option("w", "wsurl", true, "WebSockets API url to connect to");
        wsApiUrl.setRequired(true);
        options.addOption(wsApiUrl);

        CommandLineParser parser = new DefaultParser();
        HelpFormatter formatter = new HelpFormatter();
        CommandLine cmd = null;

        try {
            cmd = parser.parse(options, args);
        } catch (ParseException e) {
            System.out.println(e.getMessage());
            formatter.printHelp("streamr-client-testing", options);

            System.exit(1);
        }
        if (cmd.getOptionValue("resturl") != null) {
            restUrl = cmd.getOptionValue("resturl");
        }
        if (cmd.getOptionValue("wsurl") != null) {
            wsUrl = cmd.getOptionValue("wsurl");
        }

        boolean testCorrectness = false;
        if (cmd.getOptionValue("mode").equals("test")) {
            testCorrectness = true;
        } else if (cmd.getOptionValue("mode").equals("run")) {
            testCorrectness = false;
        } else {
            System.out.println("option 'mode' must be either 'test' or 'run'");
            System.exit(1);
        }
        Participants participants = new Participants(
                Integer.parseInt(prop.getProperty("nbJavaPublishers")),
                Integer.parseInt(prop.getProperty("nbJavaSubscribers")),
                Integer.parseInt(prop.getProperty("nbJavascriptPublishers")),
                Integer.parseInt(prop.getProperty("nbJavascriptSubscribers"))
        );
        streams = new Streams(participants, restUrl, wsUrl, testCorrectness);
        streams.start(cmd.getOptionValue("stream"));
    }
}
