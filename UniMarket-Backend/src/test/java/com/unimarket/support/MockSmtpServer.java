package com.unimarket.support;

import jakarta.mail.Session;
import jakarta.mail.internet.MimeMessage;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.List;
import java.util.Properties;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * A minimal local SMTP server for automated tests (stands in for smtp.gmail.com). Supports EHLO, AUTH LOGIN / PLAIN,
 * MAIL FROM, RCPT TO, DATA, RSET, NOOP and QUIT — no TLS (tests disable STARTTLS). Answers can be switched per test:
 * accept, wrong password (535), rejected recipient (550), unavailable (421 greeting), sending limit, slow server.
 * Every accepted message is recorded with its envelope. No real e-mail leaves the machine.
 */
public final class MockSmtpServer implements AutoCloseable {

    /** One accepted message. */
    public record Received(String authUser, String mailFrom, List<String> rcptTo, String raw) {

        /** Parses the raw RFC 5322 message. */
        public MimeMessage mime() {
            try {
                return new MimeMessage(Session.getInstance(new Properties()), new ByteArrayInputStream(raw.getBytes(StandardCharsets.UTF_8)));
            } catch (Exception ex) {
                throw new IllegalStateException(ex);
            }
        }
    }

    private final ServerSocket socket;
    private final String user;
    private volatile String password;
    private final List<Received> received = new CopyOnWriteArrayList<>();
    private volatile String greeting = "220 mock.smtp ESMTP ready";
    private volatile String rcptReply = "250 2.1.5 OK";
    private volatile String dataReply = "250 2.0.0 OK queued";
    private volatile long delayMillis;
    private volatile int connections;

    public MockSmtpServer(String user, String password) {
        this.user = user;
        this.password = password;
        try {
            socket = new ServerSocket(0, 50, InetAddress.getLoopbackAddress());
        } catch (IOException ex) {
            throw new IllegalStateException(ex);
        }
        Thread acceptor = new Thread(this::acceptLoop, "mock-smtp");
        acceptor.setDaemon(true);
        acceptor.start();
    }

    public int port() {
        return socket.getLocalPort();
    }

    public void accept() {
        greeting = "220 mock.smtp ESMTP ready";
        rcptReply = "250 2.1.5 OK";
        dataReply = "250 2.0.0 OK queued";
        delayMillis = 0;
    }

    /** Changes the password the server accepts (simulates a revoked / wrong App Password). */
    public void requirePassword(String newPassword) {
        password = newPassword;
    }

    public void rejectRecipient() {
        accept();
        rcptReply = "550 5.1.1 The email account that you tried to reach does not exist.";
    }

    public void unavailable() {
        accept();
        greeting = "421 4.3.0 Temporary System Problem. Try again later.";
    }

    public void sendingLimit() {
        accept();
        dataReply = "550 5.4.5 Daily user sending limit exceeded.";
    }

    public void slow(long millis) {
        accept();
        delayMillis = millis;
    }

    public List<Received> received() {
        return received;
    }

    public Received last() {
        return received.isEmpty() ? null : received.get(received.size() - 1);
    }

    public int connections() {
        return connections;
    }

    private void acceptLoop() {
        while (!socket.isClosed()) {
            try {
                Socket client = socket.accept();
                connections++;
                Thread worker = new Thread(() -> handle(client), "mock-smtp-client");
                worker.setDaemon(true);
                worker.start();
            } catch (IOException ex) {
                return;
            }
        }
    }

    private void handle(Socket client) {
        try (client;
             BufferedReader in = new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8));
             OutputStream out = client.getOutputStream()) {
            if (delayMillis > 0) {
                Thread.sleep(delayMillis);
            }
            reply(out, greeting);
            if (greeting.startsWith("421")) {
                return;
            }
            String authUser = null;
            String from = null;
            List<String> to = new CopyOnWriteArrayList<>();
            String line;
            while ((line = in.readLine()) != null) {
                String upper = line.toUpperCase();
                if (upper.startsWith("EHLO") || upper.startsWith("HELO")) {
                    reply(out, "250-mock.smtp\r\n250-AUTH LOGIN PLAIN\r\n250-8BITMIME\r\n250 SMTPUTF8");
                } else if (upper.startsWith("AUTH PLAIN")) {
                    String[] parts = new String(Base64.getDecoder().decode(line.substring(10).trim()), StandardCharsets.UTF_8).split("\u0000");
                    authUser = authenticate(out, parts.length == 3 ? parts[1] : "", parts.length == 3 ? parts[2] : "");
                } else if (upper.startsWith("AUTH LOGIN")) {
                    reply(out, "334 VXNlcm5hbWU6");
                    String u = new String(Base64.getDecoder().decode(in.readLine().trim()), StandardCharsets.UTF_8);
                    reply(out, "334 UGFzc3dvcmQ6");
                    String p = new String(Base64.getDecoder().decode(in.readLine().trim()), StandardCharsets.UTF_8);
                    authUser = authenticate(out, u, p);
                } else if (upper.startsWith("MAIL FROM")) {
                    if (authUser == null) {
                        reply(out, "530 5.7.0 Authentication Required.");
                        continue;
                    }
                    from = line.substring(line.indexOf(':') + 1).trim();
                    to.clear();
                    reply(out, "250 2.1.0 OK");
                } else if (upper.startsWith("RCPT TO")) {
                    reply(out, rcptReply);
                    if (rcptReply.startsWith("250")) {
                        to.add(line.substring(line.indexOf(':') + 1).trim());
                    }
                } else if (upper.equals("DATA")) {
                    reply(out, "354 Go ahead");
                    StringBuilder data = new StringBuilder();
                    String dataLine;
                    while ((dataLine = in.readLine()) != null && !dataLine.equals(".")) {
                        data.append(dataLine.startsWith("..") ? dataLine.substring(1) : dataLine).append("\r\n");
                    }
                    if (dataReply.startsWith("250")) {
                        received.add(new Received(authUser, from, List.copyOf(to), data.toString()));
                    }
                    reply(out, dataReply);
                } else if (upper.equals("QUIT")) {
                    reply(out, "221 2.0.0 closing connection");
                    return;
                } else {
                    reply(out, "250 2.0.0 OK");   // RSET, NOOP
                }
            }
        } catch (IOException | InterruptedException ex) {
            // client went away (timeout tests)
        }
    }

    private String authenticate(OutputStream out, String u, String p) throws IOException {
        if (user.equals(u) && password.equals(p)) {
            reply(out, "235 2.7.0 Accepted");
            return u;
        }
        reply(out, "535-5.7.8 Username and Password not accepted.\r\n535 5.7.8 BadCredentials");
        return null;
    }

    private static void reply(OutputStream out, String text) throws IOException {
        out.write((text + "\r\n").getBytes(StandardCharsets.UTF_8));
        out.flush();
    }

    @Override
    public void close() {
        try {
            socket.close();
        } catch (IOException ex) {
            // ignore
        }
    }
}
