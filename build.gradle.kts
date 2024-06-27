import com.diffplug.spotless.LineEnding

repositories { mavenCentral() }

plugins {
  id("com.diffplug.spotless") version "7.0.0.BETA1"
}

spotless {
    lineEndings = LineEnding.UNIX

    groovyGradle {
        target("**/*.gradle")
        targetExclude("**/node_modules/**", "**/generated/**", "**/vendor/**")

        importOrder()
        removeSemicolons()
        trimTrailingWhitespace()
        greclipse()
        indentWithSpaces(4)
        endWithNewline()
    }

    java {
        target("**/*.java")
        targetExclude("**/node_modules/**", "**/generated/**", "**/vendor/**")

        googleJavaFormat()
    }
}
