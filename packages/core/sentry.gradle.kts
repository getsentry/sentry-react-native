import org.apache.tools.ant.taskdefs.condition.Os
import org.codehaus.groovy.runtime.DefaultGroovyMethods
import org.gradle.api.tasks.Exec
import java.io.FileInputStream
import java.util.Properties
import java.util.concurrent.atomic.AtomicBoolean
import java.util.regex.Pattern
import javax.inject.Inject

val expectedSentryAndroidVersion = "8.43.3"

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
val androidAssetsDir = File("$rootDir/app/src/main/assets")

tasks.register("copySentryJsonConfiguration") {
    onlyIf { shouldCopySentryOptionsFile() }
    doLast {
        val appRoot = project.rootDir.parentFile ?: project.rootDir
        val sentryOptionsFile = File(appRoot, configFile)
        if (sentryOptionsFile.exists()) {
            if (!androidAssetsDir.exists()) {
                androidAssetsDir.mkdirs()
            }

            copy {
                from(sentryOptionsFile)
                into(androidAssetsDir)
                rename { configFile }
            }

            val sentryEnv = System.getenv("SENTRY_ENVIRONMENT")
            val sentryRelease = System.getenv("SENTRY_RELEASE")
            val sentryDist = System.getenv("SENTRY_DIST")
            if (sentryEnv != null || sentryRelease != null || sentryDist != null) {
                try {
                    val destFile = File(androidAssetsDir, configFile)

                    @Suppress("UNCHECKED_CAST")
                    val content = groovy.json.JsonSlurper().parseText(destFile.readText()) as MutableMap<String, Any>
                    if (sentryEnv != null) {
                        content["environment"] = sentryEnv
                    }
                    if (sentryRelease != null) {
                        content["release"] = sentryRelease
                    }
                    if (sentryDist != null) {
                        content["dist"] = sentryDist
                    }
                    destFile.writeText(groovy.json.JsonOutput.toJson(content))
                    if (sentryEnv != null) {
                        logger.lifecycle("Overriding 'environment' from SENTRY_ENVIRONMENT environment variable")
                    }
                    if (sentryRelease != null) {
                        logger.lifecycle("Overriding 'release' from SENTRY_RELEASE environment variable")
                    }
                    if (sentryDist != null) {
                        logger.lifecycle("Overriding 'dist' from SENTRY_DIST environment variable")
                    }
                } catch (e: Exception) {
                    logger.warn("Failed to override options in $configFile: ${e.message}. Copied file as-is.")
                }
            }
            logger.lifecycle("Copied $configFile to Android assets")
        } else {
            logger.warn("$configFile not found in app root ($appRoot)")
        }
    }
}

tasks.register("cleanupTemporarySentryJsonConfiguration") {
    onlyIf { shouldCopySentryOptionsFile() }
    doLast {
        val sentryOptionsFile = File(androidAssetsDir, configFile)
        if (sentryOptionsFile.exists()) {
            logger.lifecycle("Deleting temporary file: ${sentryOptionsFile.path}")
            sentryOptionsFile.delete()
        }
    }
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

fun processVariant(v: Any) {
    val vName = v.javaClass.getMethod("getName").invoke(v) as String
    if (vName.contains("debug", ignoreCase = true)) return

    val variantCapitalized = Character.toUpperCase(vName[0]).toString() + vName.substring(1)
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

    val modulesOutput = "$reactRoot/android/app/src/main/assets/modules.json"

    val currentVariants = extractCurrentVariants(bundleTask, v) ?: return

    var previousCliTask: TaskProvider<Task>? = null
    var applicationVariant: String? = null
    val nameCleanup = "${bundleTask.name}_SentryUploadCleanUp"
    val nameModulesCleanup = "${bundleTask.name}_SentryCollectModulesCleanUp"
    var lastModulesTask: TaskProvider<out Task>? = null

    currentVariants.forEach { (_, currentVariant) ->
        val variant = currentVariant.variantName
        val releaseName = currentVariant.releaseName
        val versionCode = currentVariant.versionCode
        applicationVariant = currentVariant.applicationVariant

        val nameCliTask = "${bundleTask.name}_SentryUpload_${releaseName}_$versionCode"
        val nameModulesTask = "${bundleTask.name}_SentryCollectModules_${releaseName}_$versionCode"

        if (tasks.names.contains(nameCliTask)) return@forEach

        val cliTask =
            tasks.register(nameCliTask) {
                onlyIf { shouldSentryAutoUploadGeneral() }
                description = "upload debug symbols to sentry"
                group = "sentry.io"

                val sentryPackage = resolveSentryReactNativeSDKPath(reactRoot)
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
                    project.logger.lifecycle("Check generated source map for Debug ID: $processOutput")

                    project.logger.lifecycle("Sentry Source Maps upload will include the release name and dist.")
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
                            project.logger.info("For $variant using: $propertiesFile")
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
                            project.logger.info("file not found '$propertiesFile' for '$variant'")
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

                        val cliPackage = resolveSentryCliPackagePath(reactRoot)
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
                        project.logger.lifecycle("Sentry-CLI arguments: $loggedArgs")
                        val osCompatibility = if (Os.isFamily(Os.FAMILY_WINDOWS)) listOf("cmd", "/c", "node") else emptyList()
                        if (System.getenv("SENTRY_DOTENV_PATH") == null && file("$reactRoot/.env.sentry-build-plugin").exists()) {
                            environment("SENTRY_DOTENV_PATH", "$reactRoot/.env.sentry-build-plugin")
                        }
                        commandLine(osCompatibility + args)
                    }
                }

                enabled = true
            }

        val modulesTask =
            tasks.register(nameModulesTask, Exec::class.java) {
                description = "collect javascript modules from bundle source map"
                group = "sentry.io"

                workingDir(reactRoot)

                val sentryPackage = resolveSentryReactNativeSDKPath(reactRoot)

                val collectModulesScript =
                    config["collectModulesScript"]
                        ?.toString()
                        ?.let { file(it).absolutePath }
                        ?: "$sentryPackage/dist/js/tools/collectModules.js"

                @Suppress("UNCHECKED_CAST")
                val modulesPaths =
                    (config["modulesPaths"] as? List<String>)
                        ?.joinToString(",")
                        ?: "$reactRoot/node_modules"
                val args = listOf("node", collectModulesScript, sourcemapOutput.toString(), modulesOutput, modulesPaths)

                if (File(collectModulesScript).exists()) {
                    project.logger.info("Sentry-CollectModules arguments: $args")
                    commandLine(args)

                    val skip = config["skipCollectModules"] == true
                    enabled = !skip
                } else {
                    project.logger.info("collectModulesScript not found: $collectModulesScript")
                    enabled = false
                }
            }
        lastModulesTask = modulesTask

        if (previousCliTask != null) {
            previousCliTask!!.configure { finalizedBy(cliTask) }
        } else {
            bundleTask.finalizedBy(cliTask)
        }
        previousCliTask = cliTask
        cliTask.configure { finalizedBy(modulesTask) }
    }

    val modulesCleanUpTask =
        tasks.register(nameModulesCleanup, Delete::class.java) {
            description = "clean up collected modules generated file"
            group = "sentry.io"

            delete(modulesOutput)
        }

    val cliCleanUpTask =
        tasks.register(nameCleanup, Delete::class.java) {
            description = "clean up extra sourcemap"
            group = "sentry.io"

            delete(sourcemapOutput)
            delete("${layout.buildDirectory.get().asFile}/intermediates/assets/release/index.android.bundle.map")
        }

    cliCleanUpTask.configure { onlyIf { result.shouldCleanUp } }
    previousCliTask?.configure { finalizedBy(cliCleanUpTask) }

    tasks
        .matching { task ->
            val appVariant = applicationVariant ?: return@matching false
            (
                "package$appVariant".equals(task.name, ignoreCase = true) ||
                    "package${appVariant}Bundle".equals(task.name, ignoreCase = true)
            ) &&
                task.enabled
        }.configureEach {
            if (lastModulesTask != null) {
                dependsOn(lastModulesTask!!)
            }
            finalizedBy(modulesCleanUpTask)
        }
}

project.afterEvaluate {
    tasks.named("preBuild").configure {
        dependsOn("copySentryJsonConfiguration")
    }
    tasks
        .matching { task ->
            task.name == "build" || task.name.startsWith("assemble") || task.name.startsWith("install")
        }.configureEach {
            finalizedBy("cleanupTemporarySentryJsonConfiguration")
        }

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
