import com.diffplug.spotless.LineEnding

repositories { mavenCentral() }

plugins {
  id("com.diffplug.spotless") version "7.0.0.BETA1"
}

spotless {
    lineEndings = LineEnding.UNIX

    format("misc") {
        // define the files to apply `misc` to
        target("*.gradle")

        // define the steps to apply to those files
        trimTrailingWhitespace()
        indentWithTabs() // or spaces. Takes an integer argument if you don't like 4
        endWithNewline()
    }

    java {
        target("**/*.java")
        googleJavaFormat()
        targetExclude("**/generated/**", "**/vendor/**")
    }
}
