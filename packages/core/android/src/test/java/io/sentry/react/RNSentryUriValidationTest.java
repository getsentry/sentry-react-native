package io.sentry.react;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import android.content.Context;
import android.net.Uri;
import java.io.File;
import java.io.IOException;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

public class RNSentryUriValidationTest {

  @Rule public TemporaryFolder tempFolder = new TemporaryFolder();

  private Context ctx;
  private File filesDir;
  private File cacheDir;

  @Before
  public void setUp() throws IOException {
    filesDir = tempFolder.newFolder("files");
    cacheDir = tempFolder.newFolder("cache");

    ctx = mock(Context.class);
    when(ctx.getFilesDir()).thenReturn(filesDir);
    when(ctx.getCacheDir()).thenReturn(cacheDir);
    when(ctx.getExternalFilesDir(null)).thenReturn(null);
    when(ctx.getExternalCacheDir()).thenReturn(null);
    when(ctx.getPackageName()).thenReturn("com.example.app");
  }

  private static Uri mockUri(String scheme, String authority, String path) {
    Uri u = mock(Uri.class);
    when(u.getScheme()).thenReturn(scheme);
    when(u.getAuthority()).thenReturn(authority);
    when(u.getPath()).thenReturn(path);
    return u;
  }

  @Test
  public void rejectsNullScheme() {
    assertFalse(RNSentryModuleImpl.isAllowedUri(mockUri(null, null, null), ctx));
  }

  @Test
  public void rejectsUnknownScheme() {
    assertFalse(RNSentryModuleImpl.isAllowedUri(mockUri("http", "example.com", "/foo"), ctx));
  }

  @Test
  public void rejectsAndroidResourceScheme() {
    assertFalse(RNSentryModuleImpl.isAllowedUri(mockUri("android.resource", "pkg", "/1"), ctx));
  }

  @Test
  public void allowsContentMediaAuthority() {
    assertTrue(
        RNSentryModuleImpl.isAllowedUri(
            mockUri("content", "media", "/external/images/media/42"), ctx));
  }

  @Test
  public void allowsContentSchemeCaseInsensitive() {
    assertTrue(RNSentryModuleImpl.isAllowedUri(mockUri("CONTENT", "Media", "/anything"), ctx));
  }

  @Test
  public void allowsSafDocumentsAuthorities() {
    assertTrue(
        RNSentryModuleImpl.isAllowedUri(
            mockUri("content", "com.android.providers.media.documents", "/doc"), ctx));
    assertTrue(
        RNSentryModuleImpl.isAllowedUri(
            mockUri("content", "com.android.externalstorage.documents", "/doc"), ctx));
    assertTrue(
        RNSentryModuleImpl.isAllowedUri(
            mockUri("content", "com.android.providers.downloads.documents", "/doc"), ctx));
  }

  @Test
  public void allowsAppOwnFileProviderAuthority() {
    assertTrue(
        RNSentryModuleImpl.isAllowedUri(
            mockUri("content", "com.example.app.fileprovider", "/shared"), ctx));
  }

  @Test
  public void rejectsForeignContentAuthority() {
    assertFalse(
        RNSentryModuleImpl.isAllowedUri(
            mockUri("content", "com.attacker.evil.provider", "/evil"), ctx));
  }

  @Test
  public void rejectsNullAuthorityOnContentScheme() {
    assertFalse(RNSentryModuleImpl.isAllowedUri(mockUri("content", null, "/x"), ctx));
  }

  @Test
  public void rejectsFileSchemeWithNullContext() {
    assertFalse(RNSentryModuleImpl.isAllowedUri(mockUri("file", null, "/tmp/x"), null));
  }

  @Test
  public void rejectsFileOutsideAppDirs() {
    assertFalse(RNSentryModuleImpl.isAllowedUri(mockUri("file", null, "/etc/passwd"), ctx));
  }

  @Test
  public void rejectsFileTargetingInternalDatabases() {
    assertFalse(
        RNSentryModuleImpl.isAllowedUri(
            mockUri("file", null, "/data/data/com.example.app/databases/app.db"), ctx));
  }

  @Test
  public void allowsFileInsideFilesDir() throws IOException {
    File target = new File(filesDir, "picked.jpg");
    target.createNewFile();
    assertTrue(
        RNSentryModuleImpl.isAllowedUri(mockUri("file", null, target.getAbsolutePath()), ctx));
  }

  @Test
  public void allowsFileInsideCacheDir() throws IOException {
    File target = new File(cacheDir, "thumb.png");
    target.createNewFile();
    assertTrue(
        RNSentryModuleImpl.isAllowedUri(mockUri("file", null, target.getAbsolutePath()), ctx));
  }

  @Test
  public void rejectsFileWithTraversalEscape() throws IOException {
    File outside = new File(tempFolder.getRoot(), "outside.txt");
    outside.createNewFile();
    String traversal = filesDir.getAbsolutePath() + "/../outside.txt";
    assertFalse(RNSentryModuleImpl.isAllowedUri(mockUri("file", null, traversal), ctx));
  }

  @Test
  public void rejectsPrefixCollision() throws IOException {
    // If filesDir is <root>/files, a path <root>/filesEvil/victim must not match as inside
    // filesDir.
    File sibling = new File(tempFolder.getRoot(), "filesEvil");
    assertTrue(sibling.mkdirs());
    File victim = new File(sibling, "victim.txt");
    victim.createNewFile();
    assertFalse(
        RNSentryModuleImpl.isAllowedUri(mockUri("file", null, victim.getAbsolutePath()), ctx));
  }

  @Test
  public void rejectsEmptyFilePath() {
    assertFalse(RNSentryModuleImpl.isAllowedUri(mockUri("file", null, ""), ctx));
    assertFalse(RNSentryModuleImpl.isAllowedUri(mockUri("file", null, null), ctx));
  }
}
