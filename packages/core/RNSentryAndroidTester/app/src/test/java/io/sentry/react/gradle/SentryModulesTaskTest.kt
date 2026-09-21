package io.sentry.react.gradle

import org.gradle.testkit.runner.GradleRunner
import org.gradle.testkit.runner.TaskOutcome
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * Functional tests for the `CollectModulesTask` wiring declared in `sentry.gradle.kts` (issue #6750 /
 * PR #6753): `modules.json` must be generated into the build folder and registered as a generated
 * assets source, never written into the version-controlled `src/main/assets` tree.
 *
 * Unlike the options task, the modules task lives inside `processVariant`, which requires a React
 * Native bundle task (`createBundle<Variant>JsAndAssets`) that exposes an extractable
 * `--sourcemap-output`. The fixture stubs that bundle task with a tiny shell script that writes a
 * source map, and points `collectModulesScript` at a fake node script so no real JS bundle is needed.
 */
class SentryModulesTaskTest {
    @get:Rule
    val tempFolder = TemporaryFolder()

    private val scriptPath: String =
        System.getProperty("sentry.gradle.script") ?: error("sentry.gradle.script system property not set")
    private val sdkDir: String =
        System.getProperty("sentry.android.sdkDir") ?: error("sentry.android.sdkDir system property not set")

    private lateinit var projectDir: File

    private val modulesTaskPath = ":createBundleReleaseJsAndAssets_SentryCollectModules"

    /** All generated `modules.json` files under the build tree (AGP relocates the task output dir). */
    private fun generatedModules(): List<File> = File(projectDir, "build").walkTopDown().filter { it.name == "modules.json" }.toList()

    private fun srcAssetsModules(): File = File(projectDir, "src/main/assets/modules.json")

    private fun writeFixture(
        skipCollectModules: Boolean = false,
        produceSourcemap: Boolean = true,
        additionalBuildTypesBlock: String = "",
    ) {
        projectDir = tempFolder.newFolder("android")

        // Shell stub for the RN bundle task: parses `--sourcemap-output <path>` out of its args and
        // writes a minimal source map there, mimicking the real bundle task's observable output.
        val makeSourcemap = File(projectDir, "make-sourcemap.sh")
        makeSourcemap.writeText(
            """
            #!/bin/sh
            out=""
            while [ ${'$'}# -gt 0 ]; do
              if [ "${'$'}1" = "--sourcemap-output" ]; then out="${'$'}2"; fi
              shift
            done
            if [ -n "${'$'}out" ]; then
              mkdir -p "${'$'}(dirname "${'$'}out")"
              printf '{"version":3,"sources":[]}' > "${'$'}out"
            fi
            """.trimIndent(),
        )

        // Fake collectModules script: `node <script> <sourcemap> <dest> <modulesPaths>` → writes dest.
        val fakeCollect = File(projectDir, "fake-collect-modules.js")
        fakeCollect.writeText(
            """
            const fs = require('fs');
            const dest = process.argv[3];
            fs.mkdirSync(require('path').dirname(dest), { recursive: true });
            fs.writeFileSync(dest, JSON.stringify({ 'fake-module': '1.0.0' }));
            """.trimIndent(),
        )

        val bundleFile = File(projectDir, "build/generated/assets/react/release/index.android.bundle")
        val sourcemapFile = File(projectDir, "build/generated/sourcemaps/react/release/index.android.bundle.map")

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

        val bundleTaskBlock =
            if (produceSourcemap) {
                """
                tasks.register("createBundleReleaseJsAndAssets", Exec) {
                    workingDir projectDir
                    executable 'sh'
                    args '${makeSourcemap.absolutePath.esc()}', '--bundle-output', '${bundleFile.absolutePath.esc()}', '--sourcemap-output', '${sourcemapFile.absolutePath.esc()}'
                }
                """
            } else {
                // Bundle task exists (so processVariant proceeds) but produces no source map.
                """
                tasks.register("createBundleReleaseJsAndAssets", Exec) {
                    workingDir projectDir
                    executable 'sh'
                    args '-c', 'true', '--bundle-output', '${bundleFile.absolutePath.esc()}', '--sourcemap-output', '${sourcemapFile.absolutePath.esc()}'
                }
                """
            }

        File(projectDir, "build.gradle").writeText(
            """
            plugins {
                id 'com.android.application' version '8.3.2'
            }
            project.ext.sentryCli = [
                collectModulesScript: '${fakeCollect.absolutePath.esc()}',
                modulesPaths        : ['node_modules'],
                skipCollectModules  : $skipCollectModules,
            ]
            android {
                namespace 'io.sentry.fixture'
                compileSdk 34
                defaultConfig {
                    minSdk 21
                    versionCode 1
                    versionName '1.0'
                }
                $additionalBuildTypesBlock
            }
            $bundleTaskBlock
            apply from: '${scriptPath.esc()}'
            """.trimIndent(),
        )

        File(projectDir, "local.properties").writeText("sdk.dir=${sdkDir.esc()}")

        val manifestDir = File(projectDir, "src/main")
        manifestDir.mkdirs()
        File(manifestDir, "AndroidManifest.xml").writeText("<manifest />")
    }

    private fun String.esc(): String = replace("\\", "\\\\")

    private fun runner(vararg args: String) =
        GradleRunner
            .create()
            .withProjectDir(projectDir)
            .withArguments(*args, "--stacktrace")
            // Disable the sourcemap-upload finalizer of the bundle task: it shells out to sentry-cli
            // scripts we don't ship in the fixture and is unrelated to what these tests cover.
            .withEnvironment(System.getenv() + mapOf("SENTRY_DISABLE_AUTO_UPLOAD" to "true"))
            .forwardOutput()

    private fun run(vararg args: String) = runner(*args).build()

    @Test
    fun `modules json is generated into build folder and never into src assets`() {
        writeFixture()

        val result = run(modulesTaskPath)

        assertEquals(TaskOutcome.SUCCESS, result.task(modulesTaskPath)?.outcome)
        val generated = generatedModules()
        assertTrue("modules.json should be generated under build/", generated.isNotEmpty())
        assertEquals("""{"fake-module":"1.0.0"}""", generated.first().readText())
        assertFalse("modules.json must never be written into src/main/assets", srcAssetsModules().exists())
    }

    @Test
    fun `second run is up-to-date`() {
        writeFixture()

        assertEquals(TaskOutcome.SUCCESS, run(modulesTaskPath).task(modulesTaskPath)?.outcome)
        assertEquals(TaskOutcome.UP_TO_DATE, run(modulesTaskPath).task(modulesTaskPath)?.outcome)
    }

    @Test
    fun `skipCollectModules leaves output empty`() {
        writeFixture(skipCollectModules = true)

        val result = run(modulesTaskPath)

        assertEquals(TaskOutcome.SUCCESS, result.task(modulesTaskPath)?.outcome)
        assertTrue("no modules.json when collection is skipped", generatedModules().isEmpty())
    }

    @Test
    fun `missing source map leaves output empty without failing`() {
        writeFixture(produceSourcemap = false)

        val result = run(modulesTaskPath)

        assertEquals(TaskOutcome.SUCCESS, result.task(modulesTaskPath)?.outcome)
        assertTrue("no modules.json when source map is absent", generatedModules().isEmpty())
    }

    /**
     * Regression for the lint-dependency scoping: the `release` variant's modules task must be wired
     * into `release`'s lint tasks only, never into a longer build type whose capitalized name ends in
     * `Release` (here `qaRelease`). A loose `it.name.contains("Release")` substring match would make
     * `lintQaRelease` depend on the `release` modules task. Only `release` has a bundle task here, so
     * the `release` modules task is the only `_SentryCollectModules` task that exists — if it shows up
     * in `lintQaRelease`'s graph, the scoping regressed.
     */
    @Test
    fun `lint task of a longer variant does not depend on a shorter variant's modules task`() {
        writeFixture(
            additionalBuildTypesBlock =
                """
                buildTypes {
                    qaRelease { initWith release }
                }
                """.trimIndent(),
        )

        // Positive control: the release variant's own lint task IS wired to the release modules task.
        val releaseGraph = runner("lintRelease", "--dry-run").build().output
        assertTrue(
            "lintRelease should depend on the release modules task",
            releaseGraph.contains(modulesTaskPath),
        )

        // Regression assertion: lintQaRelease must NOT pull in the release variant's modules task.
        val qaReleaseGraph = runner("lintQaRelease", "--dry-run").build().output
        assertFalse(
            "lintQaRelease must not depend on the release variant's modules task",
            qaReleaseGraph.contains(modulesTaskPath),
        )
    }
}
