package io.sentry.react.gradle

import org.gradle.testkit.runner.TaskOutcome
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

/**
 * Functional tests for the `generateSentryOptions` task declared in `sentry.gradle.kts`.
 *
 * The script is a Gradle *script plugin* (`apply from:`), so its task classes cannot be imported into
 * a JUnit test. Instead we stand up a minimal `com.android.application` fixture build in a temp dir,
 * apply the real script into it, and drive the task through GradleTestKit — exercising the actual AGP
 * wiring, not just the pure action logic. Shared scaffolding lives in [BaseSentryGradleTest].
 */
class SentryOptionsTaskTest : BaseSentryGradleTest() {
    /**
     * Locate the generated `sentry.options.json`. When the AGP Variant API wiring succeeds, AGP
     * relocates the task's output under `build/generated/assets/<taskName>/`, so we search the whole
     * build tree rather than hard-coding the script's requested `outputDir` (which AGP overrides).
     */
    private fun generatedOptionsOrNull(): File? = File(projectDir, "build").walkTopDown().firstOrNull { it.name == "sentry.options.json" }

    private fun writeFixture(sourceOptions: String?) {
        projectDir = tempFolder.newFolder("android")
        writeCommonFixture()

        File(projectDir, "build.gradle").writeText(
            """
            plugins {
                id 'com.android.application' version '$agpVersion'
            }
            project.ext.sentryCli = [
                collectModulesScript: 'nonexistent',
                modulesPaths        : ['node_modules'],
                skipCollectModules  : true,
            ]
            android {
                namespace 'io.sentry.fixture'
                compileSdk $compileSdk
                defaultConfig { minSdk 21 }
            }
            apply from: '${scriptPath.esc()}'
            """.trimIndent(),
        )

        // The script reads the source `sentry.options.json` from the app root's parent (the RN project
        // root), i.e. one level above the Gradle rootDir.
        if (sourceOptions != null) {
            File(projectDir.parentFile, "sentry.options.json").writeText(sourceOptions)
        }
    }

    // Scrub any `SENTRY_*` the developer has set locally (the script reads SENTRY_RELEASE /
    // SENTRY_ENVIRONMENT / SENTRY_DIST / SENTRY_COPY_OPTIONS_FILE at configuration time), so these
    // assertions depend only on the fixture and each test's explicit `env`, not the host shell.
    private fun run(
        vararg args: String,
        env: Map<String, String> = emptyMap(),
    ) = baseRunner(*args, extraEnv = env).build()

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

    @Test
    fun `override with unparseable source copies file as-is without failing`() {
        // The override branch parses the source as JSON before rewriting keys. When an override is set
        // (here SENTRY_RELEASE) but the source is not valid JSON, the task must not fail the build: it
        // logs a warning and copies the source verbatim into the build folder.
        val source = "<<< not valid json >>>"
        writeFixture(source)

        val result = run("generateSentryOptions", env = mapOf("SENTRY_RELEASE" to "1.2.3"))

        assertEquals(TaskOutcome.SUCCESS, result.task(":generateSentryOptions")?.outcome)
        val generated = generatedOptionsOrNull()
        assertNotNull("generated file should exist in build/", generated)
        assertEquals("malformed source must be copied as-is", source, generated!!.readText())
    }
}
