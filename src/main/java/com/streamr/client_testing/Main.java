package com.streamr.client_testing;

import org.apache.commons.cli.*;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.text.DateFormat;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Properties;
import java.util.logging.*;

public class Main {
    private static Streams streams;
    private static class LogFormatter extends Formatter {
        private final DateFormat df = new SimpleDateFormat("dd/MM/yyyy hh:mm:ss.SSS");

        public String format(LogRecord record) {
            StringBuilder builder = new StringBuilder(1000);
            builder.append(df.format(new Date(record.getMillis()))).append("-");
            builder.append(record.getLevel()).append(": ");
            builder.append(formatMessage(record));
            builder.append("\n");
            return builder.toString();
        }

        public String getHead(Handler h) {
            return super.getHead(h);
        }

        public String getTail(Handler h) {
            return super.getTail(h);
        }
    }
    public static final Logger logger = Logger.getAnonymousLogger();
    public static void main(String[] args) {
        Handler handler = new ConsoleHandler();
        handler.setFormatter(new LogFormatter());
        logger.setUseParentHandlers(false);
        logger.addHandler(handler);
        Properties prop = new Properties();
        try {
            InputStream in = new FileInputStream("application.conf");
            prop.load(in);
            in.close();
        } catch (IOException e) {
            e.printStackTrace();
        }
        logger.setLevel(Level.parse(prop.getProperty("logLevel")));

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
        options.addOption(wsApiUrl);

        CommandLineParser parser = new DefaultParser();
        HelpFormatter formatter = new HelpFormatter();
        CommandLine cmd = null;

        try {
            cmd = parser.parse(options, args);
        } catch (ParseException e) {
            logger.severe(e.getMessage());
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
            logger.severe("option 'mode' must be either 'test' or 'run'");
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
