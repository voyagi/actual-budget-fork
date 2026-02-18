import { readFileSync } from 'fs';

import axios from 'axios';
import { SignJWT, importPKCS8 } from 'jose';

const baseUrl =
  process.env.ENABLE_BANKING_BASE_URL ?? 'https://api.enablebanking.com';
const appId = process.env.ENABLE_BANKING_APP_ID;
const keyPath =
  process.env.ENABLE_BANKING_KEY_PATH ?? '/run/secrets/eb_private.pem';

// Module-level cache so the key is imported once per process lifetime.
let cachedPrivateKey = null;

export async function loadPrivateKey() {
  if (cachedPrivateKey) {
    return cachedPrivateKey;
  }

  const pem = readFileSync(keyPath, 'utf-8');
  cachedPrivateKey = await importPKCS8(pem, 'RS256');
  return cachedPrivateKey;
}

export async function generateJWT() {
  const privateKey = await loadPrivateKey();
  const now = Math.floor(Date.now() / 1000);

  const jwt = await new SignJWT({
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: now,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT', kid: appId })
    .sign(privateKey);

  return jwt;
}

export async function ebRequest(method, path, data) {
  const jwt = await generateJWT();

  const response = await axios({
    method,
    url: `${baseUrl}${path}`,
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    data,
  });

  return response;
}

export async function testAuth() {
  const response = await ebRequest('GET', '/application');
  return response.data;
}
