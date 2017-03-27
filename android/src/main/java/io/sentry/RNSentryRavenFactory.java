package io.sentry;


import com.getsentry.raven.DefaultRavenFactory;
import com.getsentry.raven.Raven;
import com.getsentry.raven.dsn.Dsn;

public class RNSentryRavenFactory extends DefaultRavenFactory {

    @Override
    public Raven createRavenInstance(Dsn dsn) {
        return new Raven(createConnection(dsn));
    }

}
