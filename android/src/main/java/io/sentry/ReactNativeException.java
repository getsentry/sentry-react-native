package io.sentry;

public class ReactNativeException extends RuntimeException {
    public ReactNativeException() {
        super();
    }

    public ReactNativeException(String message) {
        super(message);
    }

    public ReactNativeException(String message, Throwable cause) {
        super(message, cause);
    }

    public ReactNativeException(Throwable cause) {
        super(cause);
    }
}
