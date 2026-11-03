package com.unimarket.support;

import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * A local stand-in for the Resend API ({@code POST /emails}) for automated tests. No real e-mail is sent and no real
 * key is used. The answer can be changed per test (status, JSON body, delay); every request is recorded.
 */
public final class MockResendServer implements AutoCloseable {

    /** One recorded request. */
    public record Request(String authorization, String contentType, String body) {
    }

    private final HttpServer server;
    private final List<Request> requests = new CopyOnWriteArrayList<>();
    private volatile int status = 200;
    private volatile String responseBody;
    private volatile long delayMillis;

    public MockResendServer() {
        try {
            server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        } catch (IOException ex) {
            throw new IllegalStateException(ex);
        }
        server.createContext("/emails", exchange -> {
            byte[] in = exchange.getRequestBody().readAllBytes();
            requests.add(new Request(exchange.getRequestHeaders().getFirst("Authorization"),
                    exchange.getRequestHeaders().getFirst("Content-Type"), new String(in, StandardCharsets.UTF_8)));
            if (delayMillis > 0) {
                try {
                    Thread.sleep(delayMillis);
                } catch (InterruptedException ex) {
                    Thread.currentThread().interrupt();
                }
            }
            String body = responseBody != null ? responseBody : "{\"id\":\"" + UUID.randomUUID() + "\"}";
            byte[] out = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            try {
                exchange.sendResponseHeaders(status, out.length);
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(out);
                }
            } catch (IOException ex) {
                // client gave up (timeout test)
            }
        });
        server.start();
    }

    public String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    /** Accept every message (HTTP 200 with an id). */
    public void accept() {
        respond(200, null, 0);
    }

    /** Answer with this status and Resend-style error JSON. */
    public void refuse(int status, String name, String message) {
        respond(status, "{\"statusCode\":" + status + ",\"name\":\"" + name + "\",\"message\":\"" + message + "\"}", 0);
    }

    /** Wait before answering (timeout tests). */
    public void delay(long millis) {
        respond(200, null, millis);
    }

    private void respond(int status, String body, long delay) {
        this.status = status;
        this.responseBody = body;
        this.delayMillis = delay;
    }

    public List<Request> requests() {
        return requests;
    }

    public Request last() {
        return requests.isEmpty() ? null : requests.get(requests.size() - 1);
    }

    @Override
    public void close() {
        server.stop(0);
    }
}
