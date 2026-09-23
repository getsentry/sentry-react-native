package io.sentry.react.gradle

import org.gradle.testkit.runner.GradleRunner
import org.junit.Rule
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * Shared GradleTestKit scaffolding for the `sentry.gradle.kts` script-plugin functional tests.
 *
 * Both concrete tests stand up a minimal `com.android.application` fixture in a temp dir, apply the
 * real script, and drive tasks through GradleTestKit. The parts that don't vary between them live
 * here: the system properties injected by the host build (`app/build.gradle`), the invariant fixture
 * files (settings, local.properties, stub manifest), path escaping, and a runner with the host
 * `SENTRY_*` environment scrubbed for determinism.
 *
 * The AGP version and `compileSdk` come from the host build too (not hardcoded), so the fixtures track
 * whatever the host is on instead of pinning a stale toolchain that silently diverges on a bump.
 */
abstract class BaseSentryGradleTest {
    @get:Rule
    val tempFolder = TemporaryFolder()

    protected val scriptPath: String =
        System.getProperty("sentry.gradle.script") ?: error("sentry.gradle.script system property not set")
    protected val sdkDir: String =
        System.getProperty("sentry.android.sdkDir") ?: error("sentry.android.sdkDir system property not set")
    protected val agpVersion: String =
        System.getProperty("sentry.android.agpVersion") ?: error("sentry.android.agpVersion system property not set")
    protected val compileSdk: String =
        System.getProperty("sentry.android.compileSdk") ?: error("sentry.android.compileSdk system property not set")

    protected lateinit var projectDir: File

    /** Escape Windows path separators so an absolute path is safe inside a Groovy string literal. */
    protected fun String.esc(): String = replace("\\", "\\\\")

    /** Write the fixture files that are identical across every test: settings, local.properties, manifest. */
    protected fun writeCommonFixture() {
        File(projectDir, "settings.gradle").writeText(
            """
            pluginManagement {
                repositories {
                    google()
                    mavenCentral()
                    gradlePluginPortal()
                }
            }
            dependencyResolutionManagement {
                repositories {
                    google()
                    mavenCentral()
                }
            }
            rootProject.name = "fixture"
            """.trimIndent(),
        )

        File(projectDir, "local.properties").writeText("sdk.dir=${sdkDir.esc()}")

        val manifestDir = File(projectDir, "src/main")
        manifestDir.mkdirs()
        File(manifestDir, "AndroidManifest.xml").writeText("<manifest />")
    }

    /**
     * A [GradleRunner] for [projectDir] with the host `SENTRY_*` variables scrubbed (the script reads
     * several at configuration time), plus any [extraEnv] a specific test needs.
     */
    protected fun baseRunner(
        vararg args: String,
        extraEnv: Map<String, String> = emptyMap(),
    ): GradleRunner =
        GradleRunner
            .create()
            .withProjectDir(projectDir)
            .withArguments(*args, "--stacktrace")
            .withEnvironment(System.getenv().filterKeys { !it.startsWith("SENTRY_") } + extraEnv)
            .forwardOutput()
}
