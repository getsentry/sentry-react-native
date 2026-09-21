import org.apache.tools.ant.taskdefs.condition.Os
import org.codehaus.groovy.runtime.DefaultGroovyMethods
import org.gradle.api.DefaultTask
import org.gradle.api.file.ConfigurableFileCollection
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.InputFiles
import org.gradle.api.tasks.Internal
import org.gradle.api.tasks.Optional
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.PathSensitive
import org.gradle.api.tasks.PathSensitivity
import org.gradle.api.tasks.TaskAction
import java.io.FileInputStream
import java.util.Properties
import java.util.concurrent.atomic.AtomicBoolean
import java.util.regex.Pattern
import javax.inject.Inject

val expectedSentryAndroidVersion = "8.57.0"

val sentryVersionCheckWarned = AtomicBoolean(false)
project.configurations.configureEach {
    if (isCanBeResolved) {
        incoming.afterResolve {
            if (sentryVersionCheckWarned.get()) return@afterResolve
            resolutionResult.allComponents {
                val id = moduleVersion
                if (id != null &&
                    id.group == "io.sentry" &&
                    id.name == "sentry-android-core" &&
                    id.version != expectedSentryAndroidVersion
                ) {
                    if (sentryVersionCheckWarned.compareAndSet(false, true)) {
                        logger.warn(
                            "\nWARNING: @sentry/react-native depends on sentry-android " +
                                "$expectedSentryAndroidVersion, but version ${id.version} was resolved. " +
                                "This may cause build errors or unexpected behavior.\n" +
                                "The most common cause is the Sentry Android Gradle Plugin (SAGP) " +
                                "overriding the version via autoInstallation. To fix this, set " +
                                "autoInstallation.enabled = false in your app/build.gradle.\n" +
                                "Other causes include resolutionStrategy.force, BOMs, or another " +
                                "library depending on a different sentry-android version.\n" +
                                "See: https://docs.sentry.io/platforms/react-native/manual-setup/manual-setup/#android\n",
                        )
                    }
                }
            }
        }
    }
}

extra["shouldSentryAutoUploadNative"] =
    object : groovy.lang.Closure<Boolean>(this) {
        fun doCall(): Boolean = System.getenv("SENTRY_DISABLE_NATIVE_DEBUG_UPLOAD") != "true"
    }

extra["shouldSentryAutoUploadGeneral"] =
    object : groovy.lang.Closure<Boolean>(this) {
        fun doCall(): Boolean = System.getenv("SENTRY_DISABLE_AUTO_UPLOAD") != "true"
    }

extra["shouldSentryAutoUpload"] =
    object : groovy.lang.Closure<Boolean>(this) {
        fun doCall(): Boolean = shouldSentryAutoUploadGeneral() && shouldSentryAutoUploadNative()
    }

@Suppress("UNCHECKED_CAST")
fun shouldSentryAutoUploadNative(): Boolean {
    val closure = extra["shouldSentryAutoUploadNative"] as groovy.lang.Closure<*>
    return closure.call() as Boolean
}

@Suppress("UNCHECKED_CAST")
fun shouldSentryAutoUploadGeneral(): Boolean {
    val closure = extra["shouldSentryAutoUploadGeneral"] as groovy.lang.Closure<*>
    return closure.call() as Boolean
}

@Suppress("UNCHECKED_CAST")
fun shouldSentryAutoUpload(): Boolean {
    val closure = extra["shouldSentryAutoUpload"] as groovy.lang.Closure<*>
    return closure.call() as Boolean
}

interface InjectedExecOps {
    @get:Inject
    val execOps: org.gradle.process.ExecOperations
}

/**
 * Generates `sentry.options.json` into a `build` folder directory registered as a generated assets
 * source, so nothing is written into the version-controlled `src/main/assets` tree. Declared
 * inputs/outputs make it participate in up-to-date checks and the build cache; the action reads only
 * captured inputs and does plain file I/O, so it is Configuration Cache compatible.
 */
abstract class GenerateSentryOptionsTask : DefaultTask() {
    // File collection so a missing source is an empty input, not a failure. RELATIVE: only content matters.
    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val sourceOptionsFiles: ConfigurableFileCollection

    @get:Input
    @get:Optional
    abstract val environmentOverride: Property<String>

    @get:Input
    @get:Optional
    abstract val releaseOverride: Property<String>

    @get:Input
    @get:Optional
    abstract val distOverride: Property<String>

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    // The `SENTRY_COPY_OPTIONS_FILE` opt-out. `@Input` (not `onlyIf`) so toggling it re-runs the task,
    // which clears the output dir when disabled — a skipped task would leave a stale file to be packaged.
    @get:Input
    abstract val copyEnabled: Property<Boolean>

    @TaskAction
    fun generate() {
        val outDir = outputDir.get().asFile
        outDir.mkdirs()
        val dest = File(outDir, "sentry.options.json")
        // Idempotent: clear any prior output so a removed source file, or a disabled opt-out, leaves an
        // empty dir rather than packaging a stale file.
        if (dest.exists()) {
            dest.delete()
        }

        if (!copyEnabled.get()) {
            logger.info("sentry.options.json generation disabled via SENTRY_COPY_OPTIONS_FILE; output left empty")
            return
        }

        val source = sourceOptionsFiles.files.firstOrNull { it.exists() }
        if (source == null) {
            logger.warn("sentry.options.json not found in app root; generated assets directory left empty")
            return
        }

        val environment = environmentOverride.orNull
        val release = releaseOverride.orNull
        val dist = distOverride.orNull

        if (environment == null && release == null && dist == null) {
            dest.writeText(source.readText())
            logger.lifecycle("Generated sentry.options.json into ${dest.parentFile}")
            return
        }

        try {
            @Suppress("UNCHECKED_CAST")
            val content =
                groovy.json.JsonSlurper().parseText(source.readText()) as MutableMap<String, Any>
            if (environment != null) {
                content["environment"] = environment
                logger.lifecycle("Overriding 'environment' from SENTRY_ENVIRONMENT environment variable")
            }
            if (release != null) {
                content["release"] = release
                logger.lifecycle("Overriding 'release' from SENTRY_RELEASE environment variable")
            }
            if (dist != null) {
                content["dist"] = dist
                logger.lifecycle("Overriding 'dist' from SENTRY_DIST environment variable")
            }
            dest.writeText(groovy.json.JsonOutput.toJson(content))
        } catch (e: Exception) {
            logger.warn("Failed to override options in sentry.options.json: ${e.message}. Copied file as-is.")
            dest.writeText(source.readText())
        }
        logger.lifecycle("Generated sentry.options.json into ${dest.parentFile}")
    }
}

/**
 * Collects the JavaScript modules referenced by a release bundle's source map into a `build` folder
 * directory registered as a generated assets source, so `modules.json` is never written into the
 * version-controlled `src/main/assets` tree. Declared inputs/outputs make it participate in up-to-date
 * checks and the build cache; the node process runs through injected [org.gradle.process.ExecOperations]
 * so the action is Configuration Cache compatible.
 */
abstract class CollectModulesTask : DefaultTask() {
    // The bundle source map. File collection so a missing file is an empty input, not a failure.
    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val sourcemapFiles: ConfigurableFileCollection

    // Absolute path to the collect-modules node script, used to build the command line. `@Internal`
    // because the path alone is not a meaningful content input — the script's *content* is fingerprinted
    // via [collectModulesScriptFiles] so editing it in place (e.g. an SDK upgrade at the same path)
    // re-runs the task instead of shipping a stale modules.json.
    @get:Internal
    abstract val collectModulesScript: Property<String>

    // Content fingerprint of the collect-modules script. File collection (like [sourcemapFiles]) so a
    // missing script is an empty input rather than a task-validation failure.
    @get:InputFiles
    @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val collectModulesScriptFiles: ConfigurableFileCollection

    @get:Input
    abstract val modulesPaths: Property<String>

    // Config-time gate (script present and `skipCollectModules` not set). `@Input` (not `onlyIf`) so
    // toggling it re-runs the task, which clears the output when disabled — a skipped task would leave a
    // stale file to be packaged.
    @get:Input
    abstract val collectEnabled: Property<Boolean>

    // Working dir for the node process so a relative `modulesPaths` (e.g. "node_modules") resolves; the
    // absolute path is intentionally not a content input.
    @get:Internal
    abstract val workingDirectory: DirectoryProperty

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @get:Inject
    abstract val execOps: org.gradle.process.ExecOperations

    @TaskAction
    fun collect() {
        val outDir = outputDir.get().asFile
        outDir.mkdirs()
        val dest = File(outDir, "modules.json")
        // Idempotent: clear any prior output so a disabled opt-out or a missing source map leaves an
        // empty dir rather than packaging a stale file.
        if (dest.exists()) {
            dest.delete()
        }

        if (!collectEnabled.get()) {
            logger.info("modules.json collection disabled; generated assets directory left empty")
            return
        }

        val sourcemap = sourcemapFiles.files.firstOrNull { it.exists() }
        if (sourcemap == null) {
            logger.warn("Source map not found; modules.json generated assets directory left empty")
            return
        }

        val args =
            listOf("node", collectModulesScript.get(), sourcemap.absolutePath, dest.absolutePath, modulesPaths.get())
        logger.info("Sentry-CollectModules arguments: $args")
        execOps.exec {
            workingDir(workingDirectory.get().asFile)
            val osCompatibility = if (Os.isFamily(Os.FAMILY_WINDOWS)) listOf("cmd", "/c") else emptyList()
            commandLine(osCompatibility + args)
        }
        logger.lifecycle("Generated modules.json into $outDir")
    }
}

extra["shouldCopySentryOptionsFile"] =
    object : groovy.lang.Closure<Boolean>(this) {
        fun doCall(): Boolean = System.getenv("SENTRY_COPY_OPTIONS_FILE") != "false"
    }

@Suppress("UNCHECKED_CAST")
fun shouldCopySentryOptionsFile(): Boolean {
    val closure = extra["shouldCopySentryOptionsFile"] as groovy.lang.Closure<*>
    return closure.call() as Boolean
}

@Suppress("UNCHECKED_CAST")
val config: Map<String, Any?> =
    if (project.hasProperty("sentryCli")) {
        project.property("sentryCli") as Map<String, Any?>
    } else {
        emptyMap()
    }

val configFile = "sentry.options.json"

// Captured at configuration time so task actions do not read `project` state at execution time
// (required for Gradle Configuration Cache compatibility).
val rootDirFile = project.rootDir

// Build-folder dir holding the generated `sentry.options.json`, registered as a generated assets
// source (below) so AGP merges it into the packaged assets with correct task ordering and caching.
val sentryOptionsGeneratedDir = layout.buildDirectory.dir("generated/sentry/options")

// Read at configuration time and passed as task inputs so up-to-date checks re-run on change.
val sentryOptionsEnvironment: String? = System.getenv("SENTRY_ENVIRONMENT")
val sentryOptionsRelease: String? = System.getenv("SENTRY_RELEASE")
val sentryOptionsDist: String? = System.getenv("SENTRY_DIST")

val generateSentryOptionsTask =
    tasks.register("generateSentryOptions", GenerateSentryOptionsTask::class.java) {
        // Opt-out is a task input resolved in afterEvaluate; the action clears output when disabled.
        copyEnabled.convention(true)
        val appRoot = rootDirFile.parentFile ?: rootDirFile
        sourceOptionsFiles.from(File(appRoot, configFile))
        sentryOptionsEnvironment?.let { environmentOverride.set(it) }
        sentryOptionsRelease?.let { releaseOverride.set(it) }
        sentryOptionsDist?.let { distOverride.set(it) }
        outputDir.set(sentryOptionsGeneratedDir)
    }

// Older plugin versions copied the file into src/main/assets and a crashed build could leave it
// behind. It would now shadow or clash with the generated one. Warn (never delete — it may be
// intentional) so the user can remove the stale copy.
val legacyOptionsFile = File(project.projectDir, "src/main/assets/$configFile")
if (legacyOptionsFile.exists()) {
    project.logger.warn(
        "[sentry] Found a stale $configFile in src/main/assets; it is now generated into the build " +
            "folder and the old copy may conflict. Please remove: ${legacyOptionsFile.absolutePath}",
    )
}

// Older plugin versions generated modules.json directly into src/main/assets and cleaned it up
// afterwards; a crashed build (or a committed copy) could leave it behind. It is now generated into
// the build folder, so a leftover copy would clash with the generated one during asset merge. Warn
// (never delete — it may be intentional) so the user can remove the stale copy.
val legacyModulesFile = File(project.projectDir, "src/main/assets/modules.json")
if (legacyModulesFile.exists()) {
    project.logger.warn(
        "[sentry] Found a stale modules.json in src/main/assets; it is now generated into the build " +
            "folder and the old copy may conflict. Please remove: ${legacyModulesFile.absolutePath}",
    )
}

// Guards the classic source-set fallback so it registers at most once, only when the variant API is absent.
val sentryOptionsSourceSetFallbackApplied = AtomicBoolean(false)

fun applySentryOptionsSourceSetFallback() {
    if (!sentryOptionsSourceSetFallbackApplied.compareAndSet(false, true)) return
    try {
        val android = extensions.getByName("android")
        val sourceSets = android.javaClass.getMethod("getSourceSets").invoke(android)
        val getByName =
            sourceSets.javaClass.methods.first { it.name == "getByName" && it.parameterCount == 1 }
        val mainSourceSet = getByName.invoke(sourceSets, "main")
        val assets = mainSourceSet.javaClass.getMethod("getAssets").invoke(mainSourceSet)
        val srcDir =
            assets.javaClass.methods.first {
                it.name == "srcDir" && it.parameterCount == 1 && it.parameterTypes[0] == Any::class.java
            }
        srcDir.invoke(assets, sentryOptionsGeneratedDir.get().asFile)
        tasks
            .matching { it.name.startsWith("merge") && it.name.endsWith("Assets") }
            .configureEach { dependsOn(generateSentryOptionsTask) }
        project.logger.info("[sentry] Wired sentry.options.json into assets via sourceSets fallback")
    } catch (e: Exception) {
        project.logger.warn(
            "[sentry] Failed to wire sentry.options.json into assets: ${e.message}. " +
                "sentry.options.json may not be packaged. Please report this issue at " +
                "https://github.com/getsentry/sentry-react-native/issues",
        )
    }
}

// Wires the generated dir into a variant's assets via `addGeneratedSourceDirectory` (AGP 7.3+),
// reflectively since a script plugin can't depend on AGP types. Falls back to the source set otherwise.
fun wireSentryOptionsAssets(variant: Any) {
    try {
        val sources = variant.javaClass.getMethod("getSources").invoke(variant)
        val assets = sources.javaClass.getMethod("getAssets").invoke(sources)
        val addMethod =
            assets?.javaClass?.methods?.firstOrNull { it.name == "addGeneratedSourceDirectory" }
        if (assets == null || addMethod == null) {
            applySentryOptionsSourceSetFallback()
            return
        }
        val wiredWith: (GenerateSentryOptionsTask) -> DirectoryProperty = { it.outputDir }
        addMethod.invoke(assets, generateSentryOptionsTask, wiredWith)
    } catch (e: Exception) {
        project.logger.info("[sentry] variant assets wiring failed: ${e.message}. Falling back to sourceSets.")
        applySentryOptionsSourceSetFallback()
    }
}

// Wires a variant's generated modules dir into its assets via `addGeneratedSourceDirectory` (AGP 7.3+),
// reflectively since a script plugin can't depend on AGP types. Falls back to the source set otherwise.
fun wireSentryModulesAssets(
    variant: Any,
    modulesTask: TaskProvider<CollectModulesTask>,
    generatedDir: org.gradle.api.provider.Provider<org.gradle.api.file.Directory>,
    variantName: String,
    variantCapitalized: String,
) {
    try {
        val sources = variant.javaClass.getMethod("getSources").invoke(variant)
        val assets = sources.javaClass.getMethod("getAssets").invoke(sources)
        val addMethod =
            assets?.javaClass?.methods?.firstOrNull { it.name == "addGeneratedSourceDirectory" }
        if (assets == null || addMethod == null) {
            applySentryModulesSourceSetFallback(modulesTask, generatedDir, variantName, variantCapitalized)
            return
        }
        val wiredWith: (CollectModulesTask) -> DirectoryProperty = { it.outputDir }
        addMethod.invoke(assets, modulesTask, wiredWith)
    } catch (e: Exception) {
        project.logger.info("[sentry] variant assets wiring failed for modules: ${e.message}. Falling back to sourceSets.")
        applySentryModulesSourceSetFallback(modulesTask, generatedDir, variantName, variantCapitalized)
    }
}

fun applySentryModulesSourceSetFallback(
    modulesTask: TaskProvider<CollectModulesTask>,
    generatedDir: org.gradle.api.provider.Provider<org.gradle.api.file.Directory>,
    variantName: String,
    variantCapitalized: String,
) {
    try {
        val android = extensions.getByName("android")
        val sourceSets = android.javaClass.getMethod("getSourceSets").invoke(android)
        val getByName =
            sourceSets.javaClass.methods.first { it.name == "getByName" && it.parameterCount == 1 }
        // Register into the variant-specific source set (e.g. "release", "stagingRelease"), NOT the
        // shared "main": modules.json is per-variant and release-only, so adding each variant's dir to
        // "main" would leak the file into debug and clash between multiple non-debug variants (duplicate
        // asset merge). Scoping to the variant source set keeps each variant's modules.json isolated, so
        // no dedup guard is needed (unlike the shared-dir options fallback).
        val variantSourceSet = getByName.invoke(sourceSets, variantName)
        val assets = variantSourceSet.javaClass.getMethod("getAssets").invoke(variantSourceSet)
        val srcDir =
            assets.javaClass.methods.first {
                it.name == "srcDir" && it.parameterCount == 1 && it.parameterTypes[0] == Any::class.java
            }
        srcDir.invoke(assets, generatedDir.get().asFile)
        // Scope to this variant's merge task only: modules.json is release-only, so a debug merge must
        // never depend on (and thus trigger) the release modules/bundle tasks.
        tasks
            .matching { it.name == "merge${variantCapitalized}Assets" }
            .configureEach { dependsOn(modulesTask) }
        project.logger.info("[sentry] Wired modules.json into '$variantName' assets via sourceSets fallback")
    } catch (e: Exception) {
        project.logger.warn(
            "[sentry] Failed to wire modules.json into assets: ${e.message}. " +
                "modules.json may not be packaged. Please report this issue at " +
                "https://github.com/getsentry/sentry-react-native/issues",
        )
    }
}

plugins.withId("com.android.application") {
    try {
        val androidComponents = extensions.getByName("androidComponents")
        val selector = androidComponents.javaClass.getMethod("selector").invoke(androidComponents)
        val allSelector = selector.javaClass.getMethod("all").invoke(selector)
        val onVariantsMethod =
            androidComponents.javaClass.methods.find {
                it.name == "onVariants" && it.parameterCount == 2 && it.parameterTypes[1].isInterface
            } ?: throw NoSuchMethodException("onVariants with 2 parameters (Action interface) not found")
        val actionType = onVariantsMethod.parameterTypes[1]

        // Runs for every variant (including debug), so sentry.options.json is packaged in all builds.
        onVariantsMethod.invoke(
            androidComponents,
            allSelector,
            java.lang.reflect.Proxy.newProxyInstance(
                actionType.classLoader,
                arrayOf(actionType),
            ) { _, _, args ->
                val variant = args?.getOrNull(0)
                if (variant != null) {
                    wireSentryOptionsAssets(variant)
                }
                null
            },
        )
    } catch (e: Exception) {
        project.logger.info(
            "[sentry] Variant assets API unavailable (${e.message}); using sourceSets fallback for sentry.options.json.",
        )
        applySentryOptionsSourceSetFallback()
    }

    // AGP wires `merge*Assets` to `generateSentryOptions` via the generated-source API, but the lint
    // model/analysis tasks also read the generated assets dir without a declared dependency, which
    // Gradle 9 fails on. Declare it explicitly so the file is always produced before they run.
    tasks
        .matching { it.name != "generateSentryOptions" && it.name.contains("lint", ignoreCase = true) }
        .configureEach { dependsOn(generateSentryOptionsTask) }
}

data class BundleTaskArgs(
    val bundleOutput: File?,
    val sourcemapOutput: File?,
    val packagerSourcemapOutput: File?,
    val bundleCommand: String?,
)

fun resolveSentryReactNativeSDKPath(reactRoot: File): String {
    var resolvedSentryPath: File? = null
    try {
        val process =
            ProcessBuilder(listOf("node", "--print", "require.resolve('@sentry/react-native/package.json')"))
                .directory(rootDir)
                .start()
        val output =
            process.inputStream
                .bufferedReader()
                .readText()
                .trim()
        process.errorStream.close()
        process.waitFor()
        resolvedSentryPath = File(output).parentFile
    } catch (_: Throwable) {
    }
    return if (resolvedSentryPath != null && resolvedSentryPath.exists()) {
        resolvedSentryPath.absolutePath
    } else {
        "$reactRoot/node_modules/@sentry/react-native"
    }
}

fun resolveSentryCliPackagePath(reactRoot: File): String {
    var resolvedCliPath: File? = null
    try {
        val process =
            ProcessBuilder(
                listOf(
                    "node",
                    "--print",
                    "require.resolve('@sentry/cli/package.json', { paths: [require.resolve('@sentry/react-native/package.json')] })",
                ),
            ).directory(rootDir)
                .start()
        val output =
            process.inputStream
                .bufferedReader()
                .readText()
                .trim()
        process.errorStream.close()
        process.waitFor()
        resolvedCliPath = File(output).parentFile
    } catch (_: Throwable) {
        try {
            val pnpmRefPath = "$reactRoot/node_modules/@sentry/react-native/node_modules/.bin/sentry-cli"
            val sentryCliFile = File(pnpmRefPath)
            if (sentryCliFile.exists()) {
                val cliFileText = sentryCliFile.readText()
                val regex = Regex("""NODE_PATH="([^"]*?)@sentry/cli/""")
                val match = regex.find(cliFileText)
                if (match != null) {
                    resolvedCliPath = File(match.groupValues[1] + "@sentry/cli")
                }
            }
        } catch (_: Throwable) {
        }
    }
    return if (resolvedCliPath != null && resolvedCliPath.exists()) {
        resolvedCliPath.absolutePath
    } else {
        "$reactRoot/node_modules/@sentry/cli"
    }
}

fun extractBundleTaskArguments(
    bundleTask: Task,
    logger: Logger,
): BundleTaskArgs {
    val props = DefaultGroovyMethods.getProperties(bundleTask)
    val bundleAssetName =
        (props["bundleAssetName"] as? org.gradle.api.provider.Provider<*>)?.orNull as? String
            ?: return BundleTaskArgs(null, null, null, null)

    val bundleCommand = (props["bundleCommand"] as? org.gradle.api.provider.Provider<*>)?.orNull as? String
    val jsBundleDir = (props["jsBundleDir"] as? org.gradle.api.provider.Provider<*>)?.orNull
    val jsSourceMapsDir = (props["jsSourceMapsDir"] as? org.gradle.api.provider.Provider<*>)?.orNull
    val jsIntermediateSourceMapsDir = (props["jsIntermediateSourceMapsDir"] as? org.gradle.api.provider.Provider<*>)?.orNull

    // React Native's BundleHermesCTask declares `jsIntermediateSourceMapsDir` as a `RegularFileProperty`
    // (and other versions may do the same for the bundle/sourcemap dirs) even though they hold a
    // directory path, so accept both `Directory` and `RegularFile` here.
    val bundleDirFile =
        when (jsBundleDir) {
            is org.gradle.api.file.Directory -> jsBundleDir.asFile
            is org.gradle.api.file.RegularFile -> jsBundleDir.asFile
            else -> return BundleTaskArgs(null, null, null, null)
        }
    val sourcemapsDirFile =
        when (jsSourceMapsDir) {
            is org.gradle.api.file.Directory -> jsSourceMapsDir.asFile
            is org.gradle.api.file.RegularFile -> jsSourceMapsDir.asFile
            else -> return BundleTaskArgs(null, null, null, null)
        }
    val intermediateSourcemapsDirFile =
        when (jsIntermediateSourceMapsDir) {
            is org.gradle.api.file.Directory -> jsIntermediateSourceMapsDir.asFile
            is org.gradle.api.file.RegularFile -> jsIntermediateSourceMapsDir.asFile
            else -> return BundleTaskArgs(null, null, null, null)
        }

    val bundleFile = File(bundleDirFile.absolutePath, bundleAssetName)
    val outputSourceMap = File(sourcemapsDirFile.absolutePath, "$bundleAssetName.map")
    val packagerOutputSourceMap = File(intermediateSourcemapsDirFile.absolutePath, "$bundleAssetName.packager.map")

    logger.info("bundleFile: `$bundleFile`")
    logger.info("outputSourceMap: `$outputSourceMap`")
    logger.info("packagerOutputSourceMap: `$packagerOutputSourceMap`")
    return BundleTaskArgs(bundleFile, outputSourceMap, packagerOutputSourceMap, bundleCommand)
}

data class ForceSourceMapResult(
    val shouldCleanUp: Boolean,
    val bundleOutput: File?,
    val sourcemapOutput: File?,
    val packagerSourcemapOutput: File?,
    val bundleCommand: String?,
)

fun extractBundleTaskArgumentsLegacy(
    cmdArgs: List<String>,
    project: Project,
): BundleTaskArgs {
    var bundleOutput: String? = null
    var sourcemapOutput: String? = null
    var packagerSourcemapOutput: String? = null

    cmdArgs.forEachIndexed { i, arg ->
        if (arg == "--bundle-output" && i + 1 < cmdArgs.size) {
            bundleOutput = cmdArgs[i + 1]
            project.logger.info("--bundle-output: `$bundleOutput`")
        } else if (arg == "--sourcemap-output" && i + 1 < cmdArgs.size) {
            sourcemapOutput = cmdArgs[i + 1]
            packagerSourcemapOutput = sourcemapOutput
            project.logger.info("--sourcemap-output param: `$sourcemapOutput`")
        }
    }

    @Suppress("UNCHECKED_CAST")
    val reactExt =
        try {
            project.extensions.extraProperties.get("react") as? Map<String, Any?>
        } catch (_: Throwable) {
            null
        }

    val enableHermes = reactExt?.get("enableHermes") == true
    project.logger.info("enableHermes: `$enableHermes`")

    if (bundleOutput != null && sourcemapOutput != null && enableHermes) {
        val pattern = Pattern.compile("(/|\\\\)intermediates\\1sourcemaps\\1react\\1")
        val matcher = pattern.matcher(sourcemapOutput!!)
        if (matcher.find()) {
            project.logger.info("sourcemapOutput has the wrong path, let's fix it.")
            sourcemapOutput = bundleOutput!!
                .replace(Regex("(/|\\\\)generated\\1assets\\1react\\1"), "\$1generated\$1sourcemaps\$1react\$1") + ".map"
            project.logger.info("sourcemapOutput new path: `$sourcemapOutput`")
        }
    }

    val bundleCommand = reactExt?.get("bundleCommand") as? String ?: "bundle"

    return BundleTaskArgs(
        bundleOutput?.let { File(it) },
        sourcemapOutput?.let { File(it) },
        packagerSourcemapOutput?.let { File(it) },
        bundleCommand,
    )
}

fun forceSourceMapOutputFromBundleTask(bundleTask: Task): ForceSourceMapResult {
    var args = extractBundleTaskArguments(bundleTask, logger)

    if (args.bundleOutput == null) {
        val props = DefaultGroovyMethods.getProperties(bundleTask)

        @Suppress("UNCHECKED_CAST")
        val cmdArgs = (props["args"] as? List<String>) ?: emptyList()
        args = extractBundleTaskArgumentsLegacy(cmdArgs, project)
    }

    val bundleOutput = args.bundleOutput
    if (bundleOutput == null) {
        logger.warn("[sentry] Could not extract bundle task arguments for '${bundleTask.name}'. Source maps will not be uploaded.")
        return ForceSourceMapResult(false, null, null, null, null)
    }

    if (args.sourcemapOutput != null) {
        logger.info("Info: used pre-configured source map files: ${args.sourcemapOutput}")
        return ForceSourceMapResult(false, bundleOutput, args.sourcemapOutput, args.packagerSourcemapOutput, args.bundleCommand)
    }

    val forcedSourcemapOutput = File(bundleOutput.path + ".map")
    val props =
        org.codehaus.groovy.runtime.DefaultGroovyMethods
            .getProperties(bundleTask)

    @Suppress("UNCHECKED_CAST")
    val cmd = (props["commandLine"] as? MutableList<String>)

    @Suppress("UNCHECKED_CAST")
    val cmdArgs = (props["args"] as? MutableList<String>)
    if (cmd == null || cmdArgs == null) {
        logger.warn("[sentry] Could not inject --sourcemap-output for '${bundleTask.name}'. Source maps will not be uploaded.")
        return ForceSourceMapResult(false, null, null, null, null)
    }

    cmd.addAll(listOf("--sourcemap-output", forcedSourcemapOutput.path))
    cmdArgs.addAll(listOf("--sourcemap-output", forcedSourcemapOutput.path))
    bundleTask.setProperty("commandLine", cmd)
    bundleTask.setProperty("args", cmdArgs)
    logger.info("forced sourcemap file output for `${bundleTask.name}` task")

    return ForceSourceMapResult(true, bundleOutput, forcedSourcemapOutput, args.packagerSourcemapOutput, args.bundleCommand)
}

data class VariantInfo(
    val variantName: String,
    val releaseName: String,
    val versionCode: Any,
    val applicationVariant: String,
)

fun extractCurrentVariants(
    bundleTask: Task,
    variant: Any,
): Map<String, VariantInfo>? {
    val pattern = Pattern.compile("(?:create)?(?:B|b)undle([A-Z][A-Za-z0-9_]+)JsAndAssets")
    val matcher = pattern.matcher(bundleTask.name)

    var currentRelease = ""
    if (matcher.find()) {
        val match = matcher.group(1)
        currentRelease = Character.toLowerCase(match[0]).toString() + match.substring(1)
    }

    // Use reflection to access variant properties since AGP types are not on the script classpath
    val variantName = variant.javaClass.getMethod("getName").invoke(variant) as String

    if (!variantName.equals(currentRelease, ignoreCase = true)) {
        return null
    }

    val currentVariants = mutableMapOf<String, VariantInfo>()
    val applicationId = variant.javaClass.getMethod("getApplicationId").invoke(variant)
    val appId = (applicationId as org.gradle.api.provider.Provider<*>).get() as String

    val outputs = variant.javaClass.getMethod("getOutputs").invoke(variant) as Iterable<*>
    for (output in outputs) {
        if (output == null) continue

        val versionCodeProvider = output.javaClass.getMethod("getVersionCode").invoke(output) as org.gradle.api.provider.Provider<*>
        val versionNameProvider = output.javaClass.getMethod("getVersionName").invoke(output) as org.gradle.api.provider.Provider<*>

        val defaultVersionCode = versionCodeProvider.orNull ?: 0
        var versionCode: Any = System.getenv("SENTRY_DIST") ?: defaultVersionCode
        if (versionCode is String) {
            try {
                versionCode = Math.abs(versionCode.toInt())
            } catch (_: NumberFormatException) {
                project.logger.info("versionCode: '$versionCode' isn't an Integer, using the plain value.")
            }
        }

        val versionName = (versionNameProvider.orNull as? String) ?: ""
        val defaultReleaseName = "$appId@$versionName+$versionCode"
        val releaseName = System.getenv("SENTRY_RELEASE") ?: defaultReleaseName

        val outputName = output.javaClass.getMethod("getBaseName").invoke(output) as String

        currentVariants[outputName] = VariantInfo(outputName, releaseName, versionCode, variantName)
    }

    return currentVariants
}

plugins.withId("com.android.application") {
    val androidComponents = extensions.getByName("androidComponents")

    try {
        val selectorMethod = androidComponents.javaClass.getMethod("selector")
        val selector = selectorMethod.invoke(androidComponents)
        val allMethod = selector.javaClass.getMethod("all")
        val allSelector = allMethod.invoke(selector)

        val onVariantsMethod =
            androidComponents.javaClass.methods.find {
                it.name == "onVariants" && it.parameterCount == 2 && it.parameterTypes[1].isInterface
            } ?: throw NoSuchMethodException("onVariants with 2 parameters (Action interface) not found")
        val actionType = onVariantsMethod.parameterTypes[1]

        onVariantsMethod.invoke(
            androidComponents,
            allSelector,
            java.lang.reflect.Proxy.newProxyInstance(
                actionType.classLoader,
                arrayOf(actionType),
            ) { _, _, args ->
                if (args != null && args.isNotEmpty()) {
                    processVariant(args[0]!!)
                }
                null
            },
        )
    } catch (e: Exception) {
        project.logger.warn(
            "[sentry] Failed to set up variant processing via AGP reflection: ${e.message}. " +
                "Source maps will not be uploaded. Please report this issue at " +
                "https://github.com/getsentry/sentry-react-native/issues",
        )
    }
}

// Capitalized names of every non-debug variant the plugin has seen, shared across [processVariant]
// calls (all of which run during configuration, before any lint task is realized). Used to scope each
// variant's lint→modules dependency without enumerating AGP's lint verbs: a lint task belongs to a
// *different* variant when its name contains a longer processed variant name that has the current one
// as a substring (e.g. `release` vs `qaRelease` / `releaseStaging`), so it can be excluded precisely.
val sentryProcessedVariantCaps: MutableSet<String> = java.util.Collections.synchronizedSet(mutableSetOf())

fun processVariant(v: Any) {
    val vName = v.javaClass.getMethod("getName").invoke(v) as String
    if (vName.contains("debug", ignoreCase = true)) return

    // Captured here (inside the onVariants callback, which runs after the app build.gradle has
    // evaluated) rather than at apply-time, so a `project.ext.shouldSentryAutoUploadGeneral`
    // override set right after `apply from` (e.g. the Expo `disableAutoUpload` plugin) is honored.
    // Referencing this captured boolean in `onlyIf` keeps the task Configuration Cache compatible.
    val sentryAutoUploadGeneralEnabled = shouldSentryAutoUploadGeneral()

    val variantCapitalized = Character.toUpperCase(vName[0]).toString() + vName.substring(1)
    sentryProcessedVariantCaps.add(variantCapitalized)
    val sentryBundleTaskName =
        listOf(
            "createBundle${variantCapitalized}JsAndAssets",
            "bundle${variantCapitalized}JsAndAssets",
        ).find { tasks.names.contains(it) }

    if (sentryBundleTaskName == null) {
        project.logger.warn(
            "[sentry] No bundle task found for variant '$vName'. " +
                "Expected 'createBundle${variantCapitalized}JsAndAssets' or " +
                "'bundle${variantCapitalized}JsAndAssets'. Source maps will not be uploaded.",
        )
        return
    }

    val bundleTask = tasks.named(sentryBundleTaskName).get()
    if (!bundleTask.enabled) return

    val result = forceSourceMapOutputFromBundleTask(bundleTask)
    if (result.bundleOutput == null || result.sourcemapOutput == null) return

    val bundleOutput = result.bundleOutput
    val sourcemapOutput = result.sourcemapOutput
    val packagerSourcemapOutput = result.packagerSourcemapOutput

    val props = DefaultGroovyMethods.getProperties(bundleTask)
    var reactRootResolved: File? = props["workingDir"] as? File
    if (reactRootResolved == null) {
        val rootProvider = props["root"] as? org.gradle.api.provider.Provider<*>
        val rootValue = rootProvider?.get()
        reactRootResolved =
            when (rootValue) {
                is File -> rootValue
                is org.gradle.api.file.Directory -> rootValue.asFile
                else -> null
            }
    }
    if (reactRootResolved == null) {
        project.logger.warn("[sentry] Could not determine reactRoot for '${bundleTask.name}'.")
        return
    }
    val reactRoot = reactRootResolved

    val currentVariants = extractCurrentVariants(bundleTask, v) ?: return

    var previousCliTask: TaskProvider<Task>? = null
    val nameCleanup = "${bundleTask.name}_SentryUploadCleanUp"

    // Collect the bundle's JS modules into a build-folder dir registered as a generated assets source,
    // so `modules.json` is never written into src/main/assets. One task per (release) variant; AGP wires
    // it into `merge${variantCapitalized}Assets` with correct ordering and up-to-date/caching behavior.
    val sentryPackageForModules = resolveSentryReactNativeSDKPath(reactRoot)
    val collectModulesScriptPath =
        config["collectModulesScript"]
            ?.toString()
            ?.let { file(it).absolutePath }
            ?: "$sentryPackageForModules/dist/js/tools/collectModules.js"

    @Suppress("UNCHECKED_CAST")
    val modulesPathsValue =
        (config["modulesPaths"] as? List<String>)
            ?.joinToString(",")
            ?: "$reactRoot/node_modules"
    val skipCollectModules = config["skipCollectModules"] == true
    val modulesGeneratedDir = layout.buildDirectory.dir("generated/sentry/modules/$vName")

    val modulesTask =
        tasks.register("${bundleTask.name}_SentryCollectModules", CollectModulesTask::class.java) {
            description = "collect javascript modules from bundle source map"
            group = "sentry.io"
            sourcemapFiles.from(sourcemapOutput)
            collectModulesScript.set(collectModulesScriptPath)
            collectModulesScriptFiles.from(collectModulesScriptPath)
            modulesPaths.set(modulesPathsValue)
            collectEnabled.set(!skipCollectModules && File(collectModulesScriptPath).exists())
            workingDirectory.set(reactRoot)
            outputDir.set(modulesGeneratedDir)
            dependsOn(sentryBundleTaskName)
        }

    wireSentryModulesAssets(v, modulesTask, modulesGeneratedDir, vName, variantCapitalized)

    // Lint model/analysis tasks read merged assets (now including the generated modules dir) without a
    // declared dependency; Gradle 9 fails on that. Declare it for this variant's lint tasks so
    // modules.json is produced first. Match the whole AGP lint family verb-agnostically: every AGP lint
    // task either starts with the lowercase `lint` verb (lint/lintAnalyze/lintReport/lintVital*/lintFix,
    // incl. `lintAnalyze<Variant>UnitTest`) or embeds a capitalized `Lint` segment (`updateLintBaseline*`,
    // `generate*Lint*Model`). Requiring the `Lint` word boundary (start-of-name or capital L) — NOT a
    // case-insensitive `lint` substring — excludes unrelated `ktlint*` tasks (e.g. `ktlintReleaseCheck`)
    // whose lowercase `lint` is mid-name; those must not pull in the JS bundler. Scope precisely to THIS
    // variant: a task belongs to a *different* variant when its name also contains a longer processed
    // variant name that has this one as a substring (e.g. `release` vs `qaRelease` / `releaseStaging`), so
    // exclude those — their own variant pass wires them to their own modules task. This scoping needs the
    // full variant set, which is complete by the time lint tasks are realized (all onVariants callbacks run
    // during configuration).
    tasks
        .matching { task ->
            val name = task.name
            (name.startsWith("lint") || name.contains("Lint")) &&
                name.contains(variantCapitalized) &&
                sentryProcessedVariantCaps.none { other ->
                    other != variantCapitalized && other.contains(variantCapitalized) && name.contains(other)
                }
        }.configureEach { dependsOn(modulesTask) }

    currentVariants.forEach { (_, currentVariant) ->
        val variant = currentVariant.variantName
        val releaseName = currentVariant.releaseName
        val versionCode = currentVariant.versionCode

        val nameCliTask = "${bundleTask.name}_SentryUpload_${releaseName}_$versionCode"

        if (tasks.names.contains(nameCliTask)) return@forEach

        val cliTask =
            tasks.register(nameCliTask) {
                onlyIf { sentryAutoUploadGeneralEnabled }
                description = "upload debug symbols to sentry"
                group = "sentry.io"

                val sentryPackage = resolveSentryReactNativeSDKPath(reactRoot)
                // Resolved at configuration time and captured: calling this script method from
                // inside the doLast exec closure would fail under the Configuration Cache (the
                // serialized task action can't resolve top-level script methods).
                val cliPackage = resolveSentryCliPackagePath(reactRoot)
                val copyDebugIdScript =
                    config["copyDebugIdScript"]
                        ?.toString()
                        ?.let { file(it).absolutePath }
                        ?: "$sentryPackage/scripts/copy-debugid.js"
                val hasSourceMapDebugIdScript =
                    config["hasSourceMapDebugIdScript"]
                        ?.toString()
                        ?.let { file(it).absolutePath }
                        ?: "$sentryPackage/scripts/has-sourcemap-debugid.js"

                val injected = project.objects.newInstance(InjectedExecOps::class.java)
                val extraArgs = mutableListOf<String>()

                doFirst {
                    injected.execOps.exec {
                        val args = listOf("node", copyDebugIdScript, packagerSourcemapOutput.toString(), sourcemapOutput.toString())
                        val osCompatibility = if (Os.isFamily(Os.FAMILY_WINDOWS)) listOf("cmd", "/c") else emptyList()
                        commandLine(osCompatibility + args)
                    }

                    val process =
                        ProcessBuilder(listOf("node", hasSourceMapDebugIdScript, sourcemapOutput.toString()))
                            .directory(reactRoot)
                            .redirectErrorStream(true)
                            .start()
                    val processOutput = process.inputStream.bufferedReader().readText()
                    process.waitFor()
                    logger.lifecycle("Check generated source map for Debug ID: $processOutput")

                    logger.lifecycle("Sentry Source Maps upload will include the release name and dist.")
                    extraArgs.addAll(listOf("--release", releaseName, "--dist", versionCode.toString()))
                }

                doLast {
                    injected.execOps.exec {
                        workingDir(reactRoot)

                        var propertiesFile =
                            config["sentryProperties"]?.toString()
                                ?: "$reactRoot/android/sentry.properties"
                        val flavorAware = config["flavorAware"] == true

                        if (flavorAware) {
                            propertiesFile = "$reactRoot/android/sentry-$variant.properties"
                            logger.info("For $variant using: $propertiesFile")
                        } else {
                            environment("SENTRY_PROPERTIES", propertiesFile)
                        }

                        val sentryProps = Properties()
                        try {
                            sentryProps.load(FileInputStream(propertiesFile))
                        } catch (e: java.io.FileNotFoundException) {
                            if (flavorAware) {
                                throw GradleException(
                                    "Sentry: expected properties file not found for variant '$variant': $propertiesFile. " +
                                        "Create it, or disable 'flavorAware' in project.ext.sentryCli.",
                                )
                            }
                            logger.info("file not found '$propertiesFile' for '$variant'")
                        }

                        val sentryUrl = sentryProps.getProperty("defaults.url")
                        val sentryAuthToken = sentryProps.getProperty("auth.token") ?: System.getenv("SENTRY_AUTH_TOKEN")
                        val sentryOrg = sentryProps.getProperty("defaults.org")
                        val sentryProject = sentryProps.getProperty("defaults.project")

                        if (flavorAware) {
                            val missing = mutableListOf<String>()
                            if (sentryAuthToken == null) missing.add("auth.token (or SENTRY_AUTH_TOKEN env var)")
                            if (sentryOrg == null) missing.add("defaults.org")
                            if (sentryProject == null) missing.add("defaults.project")
                            if (missing.isNotEmpty()) {
                                throw GradleException(
                                    "Sentry: missing required properties in '$propertiesFile' for variant '$variant':\n" +
                                        "  - " + missing.joinToString("\n  - "),
                                )
                            }
                        }

                        var cliExecutable = sentryProps.getProperty("cli.executable") ?: "$cliPackage/bin/sentry-cli"

                        if (Os.isFamily(Os.FAMILY_WINDOWS)) {
                            cliExecutable = cliExecutable.replace("/", "\\")
                        }

                        val args = mutableListOf(cliExecutable)

                        val logLevel = config["logLevel"]?.toString()
                        if (logLevel != null) {
                            args.addAll(listOf("--log-level", logLevel))
                        }
                        if (flavorAware) {
                            if (sentryUrl != null) {
                                args.addAll(listOf("--url", sentryUrl))
                            }
                            args.addAll(listOf("--auth-token", sentryAuthToken!!))
                        }
                        args.addAll(
                            listOf(
                                "react-native",
                                "gradle",
                                "--bundle",
                                bundleOutput.toString(),
                                "--sourcemap",
                                sourcemapOutput.toString(),
                            ),
                        )
                        if (flavorAware) {
                            args.addAll(listOf("--org", sentryOrg!!, "--project", sentryProject!!))
                        }

                        args.addAll(extraArgs)

                        val loggedArgs =
                            if (sentryAuthToken != null) {
                                args.map { if (it == sentryAuthToken) "***" else it }
                            } else {
                                args
                            }
                        logger.lifecycle("Sentry-CLI arguments: $loggedArgs")
                        val osCompatibility = if (Os.isFamily(Os.FAMILY_WINDOWS)) listOf("cmd", "/c", "node") else emptyList()
                        if (System.getenv("SENTRY_DOTENV_PATH") == null && File("$reactRoot/.env.sentry-build-plugin").exists()) {
                            environment("SENTRY_DOTENV_PATH", "$reactRoot/.env.sentry-build-plugin")
                        }
                        commandLine(osCompatibility + args)
                    }
                }

                enabled = true
            }

        if (previousCliTask != null) {
            previousCliTask!!.configure { finalizedBy(cliTask) }
        } else {
            bundleTask.finalizedBy(cliTask)
        }
        previousCliTask = cliTask
    }

    val cliCleanUpTask =
        tasks.register(nameCleanup, Delete::class.java) {
            description = "clean up extra sourcemap"
            group = "sentry.io"

            delete(sourcemapOutput)
            delete("${layout.buildDirectory.get().asFile}/intermediates/assets/release/index.android.bundle.map")
        }

    // The modules task reads the source map; ensure the upload cleanup (which deletes it) can only run
    // after modules has run. They were previously serialized through the `finalizedBy` chain.
    cliCleanUpTask.configure {
        onlyIf { result.shouldCleanUp }
        mustRunAfter(modulesTask)
    }
    previousCliTask?.configure { finalizedBy(cliCleanUpTask) }
}

project.afterEvaluate {
    // Resolve the overridable closure now (after the app build.gradle evaluated) so an override placed
    // after `apply from` is honored, and set it on the task for its onlyIf to read.
    val optionsCopyEnabled = shouldCopySentryOptionsFile()
    generateSentryOptionsTask.configure { copyEnabled.set(optionsCopyEnabled) }

    val flavorAware = config["flavorAware"] == true
    val sentryProperties = config["sentryProperties"]

    if (flavorAware && sentryProperties != null) {
        throw GradleException(
            "Incompatible sentry configuration. " +
                "You cannot use both `flavorAware` and `sentryProperties`. " +
                "Please remove one of these from the project.ext.sentryCli configuration.",
        )
    }

    val sentryPropertiesFile =
        when (sentryProperties) {
            is File -> sentryProperties
            null -> null
            else -> file(sentryProperties.toString())
        }

    if (sentryPropertiesFile != null) {
        if (!sentryPropertiesFile.exists()) {
            throw GradleException(
                "project.ext.sentryCli configuration defines a non-existent 'sentryProperties' file: " +
                    sentryPropertiesFile.absolutePath,
            )
        }
        logger.info("Using 'sentry.properties' at: " + sentryPropertiesFile.absolutePath)
    }

    if (flavorAware) {
        println("**********************************")
        println("* Flavor aware sentry properties *")
        println("**********************************")
    }
}
