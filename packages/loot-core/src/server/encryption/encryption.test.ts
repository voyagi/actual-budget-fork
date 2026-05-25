import * as encryption from '.';

afterEach(() => encryption.unloadAllKeys());

describe('Encryption', () => {
  test('should encrypt and decrypt', async () => {
    const key = await encryption.createKey({
      id: 'foo',
      password: 'mypassword',
      salt: 'salt',
    });
    await encryption.loadKey(key);

    const data = await encryption.encrypt('hello', 'foo');

    const output = await encryption.decrypt(data.value, data.meta);
    expect(output.toString()).toBe('hello');
  });

  test('encrypt metadata includes iterations field with value 100000', async () => {
    const key = await encryption.createKey({
      id: 'iter-test',
      password: 'mypassword',
      salt: 'salt',
    });
    await encryption.loadKey(key);

    const data = await encryption.encrypt('test-iterations', 'iter-test');

    expect(data.meta.iterations).toBe(100_000);
  });

  test('key created with explicit 10K iterations can decrypt its own data (backward compat)', async () => {
    // Simulate legacy: create key with explicit 10,000 iterations
    const legacyKey = await encryption.createKey({
      id: 'legacy-key',
      password: 'mypassword',
      salt: 'salt',
      iterations: 10_000,
    });
    await encryption.loadKey(legacyKey);

    const data = await encryption.encrypt('legacy-data', 'legacy-key');

    // Decrypt with the same 10K key
    const output = await encryption.decrypt(data.value, data.meta);
    expect(output.toString()).toBe('legacy-data');
  });
});
