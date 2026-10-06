import { fileUri } from '../file-uri.mjs';
import { mockNativeModules } from './mock-native-modules.mjs';

const fakeKey = '__kuyaraFakeExpoFileSystem';

/**
 * Replaces `expo-file-system` with an in-memory device file system and returns its state, so a
 * test can seed files and script failures. Call it before the module under test is imported.
 *
 * `files` maps a file uri to its text (a file made without text holds ''). Set a failure field
 * to make that operation throw: `readFailure` and `writeFailure` are booleans, `copyFailure`
 * is an error thrown after the copy lands, and `deleteFailure` is an error that fails every
 * delete or a function from a uri to the error (or nothing) for that file. `createdDirectories`
 * records each `[uri, options]` a directory was created with.
 */
export function installFakeExpoFileSystem({
  documentUri = 'file:///documents',
  cacheUri = 'file:///cache',
} = {}) {
  const fake = {
    files: new Map(),
    directories: new Set(),
    modified: new Map(),
    createdDirectories: [],
    readFailure: false,
    writeFailure: false,
    copyFailure: null,
    deleteFailure: null,
  };

  function throwOnRead() {
    if (fake.readFailure) throw new Error('read failed');
  }

  function throwOnWrite() {
    if (fake.writeFailure) throw new Error('write failed');
  }

  class Directory {
    constructor(...parts) {
      this.uri = fileUri(parts);
    }

    get exists() {
      return fake.directories.has(this.uri);
    }

    create(options) {
      throwOnWrite();
      fake.directories.add(this.uri);
      fake.createdDirectories.push([this.uri, options]);
    }

    list() {
      const prefix = `${this.uri}/`;
      const isChild = (uri) => uri.startsWith(prefix) && !uri.slice(prefix.length).includes('/');
      return [
        ...[...fake.directories].filter(isChild).map((uri) => new Directory(uri)),
        ...[...fake.files.keys()].filter(isChild).map((uri) => new File(uri)),
      ];
    }
  }

  class File {
    constructor(...parts) {
      this.uri = fileUri(parts);
    }

    get exists() {
      throwOnRead();
      return fake.files.has(this.uri);
    }

    get name() {
      return this.uri.slice(this.uri.lastIndexOf('/') + 1);
    }

    get lastModified() {
      // Like the real module on a failed read, a file without a recorded time answers undefined.
      return fake.modified.get(this.uri);
    }

    async text() {
      throwOnRead();
      return fake.files.get(this.uri);
    }

    write(value) {
      throwOnWrite();
      fake.files.set(this.uri, value);
    }

    async copy(destination) {
      fake.files.set(destination.uri, fake.files.get(this.uri) ?? '');
      if (fake.copyFailure) throw fake.copyFailure;
    }

    delete() {
      const failure = typeof fake.deleteFailure === 'function'
        ? fake.deleteFailure(this.uri)
        : fake.deleteFailure;
      if (failure) throw failure;
      fake.files.delete(this.uri);
    }
  }

  globalThis[fakeKey] = {
    Directory,
    File,
    Paths: { document: { uri: documentUri }, cache: { uri: cacheUri } },
  };
  mockNativeModules({
    'expo-file-system': `export const { Directory, File, Paths } = globalThis.${fakeKey};`,
  });
  return fake;
}
