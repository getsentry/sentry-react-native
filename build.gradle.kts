import com.diffplug.spotless.LineEnding

repositories { mavenCentral() }

plugins {
    id("com.diffplug.spotless") version "7.0.0.BETA1"
}

spotless {
    lineEndings = LineEnding.UNIX

    groovyGradle {
        target("*.gradle") // TODO: target all, but avoid slow targetExclude

        importOrder()
        removeSemicolons()
        trimTrailingWhitespace()
        greclipse()
        indentWithSpaces(4)
        endWithNewline()
    }

    java {
        target("*.java") // TODO: target all, but avoid slow targetExclude

        googleJavaFormat()
        indentWithSpaces(4)
    }

    kotlin {
        target("*.kt") // TODO: target all, but avoid slow targetExclude

        ktlint()
        indentWithSpaces(4)
    }

    kotlinGradle {
        target("*.kts") // TODO: target all, but avoid slow targetExclude

        ktlint()
        indentWithSpaces(4)
    }
}
