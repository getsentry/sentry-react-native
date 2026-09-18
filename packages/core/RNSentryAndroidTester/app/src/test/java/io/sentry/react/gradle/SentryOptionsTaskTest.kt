package io.sentry.react.gradle

import org.gradle.testkit.runner.GradleRunner
import org.gradle.testkit.runner.TaskOutcome
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * Functional tests for the `generateSentryOptions` task declared in `sentry.gradle.kts`.
 *
 * The script is a Gradle *script plugin* (`apply from:`), so its task classes cannot be imported into
 * a JUnit test. Instead we stand up a minimal `com.android.application` fixture build in a temp dir,
 * apply the real script into it, and drive the task through GradleTestKit — exercising the actual AGP
 * wiring, not just the pure action logic.
 */
class SentryOptionsTaskTest {
    @get:Rule
    val tempFolder = TemporaryFolder()

    private val scriptPath: String =
        System.getProperty("sentry.gradle.script") ?: error("sentry.gradle.script system property not set")
    private val sdkDir: String =
        System.getProperty("sentry.android.sdkDir") ?: error("sentry.android.sdkDir system property not set")

    private lateinit var projectDir: File

    /**
     * Locate the generated `sentry.options.json`. When the AGP Variant API wiring succeeds, AGP
     * relocates the task's output under `build/generated/assets/<taskName>/`, so we search the whole
     * build tree rather than hard-coding the script's requested `outputDir` (which AGP overrides).
     */
    private fun generatedOptionsOrNull(): File? = File(projectDir, "build").walkTopDown().firstOrNull { it.name == "sentry.options.json" }

    private fun writeFixture(sourceOptions: String?) {
        projectDir = tempFolder.newFolder("android")

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

        File(projectDir, "build.gradle").writeText(
            """
            plugins {
                id 'com.android.application' version '8.3.2'
            }
            project.ext.sentryCli = [
                collectModulesScript: 'nonexistent',
                modulesPaths        : ['node_modules'],
                skipCollectModules  : true,
            ]
            android {
                namespace 'io.sentry.fixture'
                compileSdk 34
                defaultConfig { minSdk 21 }
            }
            apply from: '${scriptPath.replace("\\", "\\\\")}'
            """.trimIndent(),
        )

        File(projectDir, "local.properties").writeText("sdk.dir=${sdkDir.replace("\\", "\\\\")}")

        val manifestDir = File(projectDir, "src/main")
        manifestDir.mkdirs()
        File(manifestDir, "AndroidManifest.xml").writeText("<manifest />")

        // The script reads the source `sentry.options.json` from the app root's parent (the RN project
        // root), i.e. one level above the Gradle rootDir.
        if (sourceOptions != null) {
            File(projectDir.parentFile, "sentry.options.json").writeText(sourceOptions)
        }
    }

    private fun run(
        vararg args: String,
        env: Map<String, String> = emptyMap(),
    ) = GradleRunner
        .create()
        .withProjectDir(projectDir)
        .withArguments(*args, "--stacktrace")
        .withEnvironment(System.getenv() + env)
        .forwardOutput()
        .build()

    @Test
    fun `plain copy - no overrides copies source verbatim into build folder`() {
        val source = """{"dsn":"https://examplePublicKey@o0.ingest.sentry.io/0","debug":true}"""
        writeFixture(source)

        val result = run("generateSentryOptions")

        assertEquals(TaskOutcome.SUCCESS, result.task(":generateSentryOptions")?.outcome)
        val generated = generatedOptionsOrNull()
        assertNotNull("generated file should exist in build/", generated)
        assertEquals(source, generated!!.readText())
    }

    @Test
    fun `SENTRY_RELEASE override rewrites release key and preserves others`() {
        writeFixture("""{"dsn":"https://k@o0.ingest.sentry.io/0","environment":"prod"}""")

        val result = run("generateSentryOptions", env = mapOf("SENTRY_RELEASE" to "1.2.3"))

        assertEquals(TaskOutcome.SUCCESS, result.task(":generateSentryOptions")?.outcome)
        val generated = generatedOptionsOrNull()
        assertNotNull("generated file should exist in build/", generated)
        val json = groovy.json.JsonSlurper().parseText(generated!!.readText()) as Map<*, *>
        assertEquals("1.2.3", json["release"])
        assertEquals("prod", json["environment"])
    }

    @Test
    fun `opt-out via SENTRY_COPY_OPTIONS_FILE=false leaves output empty`() {
        writeFixture("""{"dsn":"https://k@o0.ingest.sentry.io/0"}""")

        val result = run("generateSentryOptions", env = mapOf("SENTRY_COPY_OPTIONS_FILE" to "false"))

        assertEquals(TaskOutcome.SUCCESS, result.task(":generateSentryOptions")?.outcome)
        assertNull("output must be empty when opted out", generatedOptionsOrNull())
    }

    @Test
    fun `missing source file leaves output empty without failing`() {
        writeFixture(sourceOptions = null)

        val result = run("generateSentryOptions")

        assertEquals(TaskOutcome.SUCCESS, result.task(":generateSentryOptions")?.outcome)
        assertNull(generatedOptionsOrNull())
    }
}
