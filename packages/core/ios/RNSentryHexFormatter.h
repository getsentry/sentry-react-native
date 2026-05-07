#import <Foundation/Foundation.h>

// 2 for the "0x" prefix, plus 16 for the hex value, plus 1 for the null terminator.
#define RN_SENTRY_HEX_ADDRESS_LENGTH 19

/**
 * Formats a 64-bit unsigned integer as a zero-padded hex address string
 * (e.g. @c 0x000000010f1a2b3c).
 *
 * Inlined here so we don't need to reach into sentry-cocoa's private
 * @c SentryFormatter.h via @c HEADER_SEARCH_PATHS. Keep behavior identical
 * to @c sentry_snprintfHexAddress in sentry-cocoa.
 */
static inline NSString *
rnsentry_snprintfHexAddress(uint64_t value)
{
    char buffer[RN_SENTRY_HEX_ADDRESS_LENGTH];
    snprintf(buffer, RN_SENTRY_HEX_ADDRESS_LENGTH, "0x%016llx", value);
    return [NSString stringWithCString:buffer encoding:NSASCIIStringEncoding];
}

/**
 * Formats an @c NSNumber address as a zero-padded hex string.
 * Drop-in replacement for sentry-cocoa's @c sentry_formatHexAddress.
 */
static inline NSString *
rnsentry_formatHexAddress(NSNumber *value)
{
    return rnsentry_snprintfHexAddress([value unsignedLongLongValue]);
}

/**
 * Formats a @c uint64_t address as a zero-padded hex string.
 * Drop-in replacement for sentry-cocoa's @c sentry_formatHexAddressUInt64.
 */
static inline NSString *
rnsentry_formatHexAddressUInt64(uint64_t value)
{
    return rnsentry_snprintfHexAddress(value);
}
