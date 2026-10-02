import crypto from "crypto";
import {
  decryptSecretFromStorage,
  decryptSecretWithRotation,
  encryptSecretForStorage,
  isEncryptedSecret,
  rotateEncryptedSecret,
} from "../utils/secret-crypto.js";

let passed = 0;
let failed = 0;

const ok = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}`);
    console.log(`      expected: ${JSON.stringify(expected)}`);
    console.log(`      actual:   ${JSON.stringify(actual)}`);
  }
};

const throws = (name, fn) => {
  try {
    fn();
    failed += 1;
    console.log(`FAIL  ${name} (expected a throw)`);
  } catch {
    passed += 1;
    console.log(`PASS  ${name}`);
  }
};

const hexKey = () => crypto.randomBytes(64).toString("hex");
const setEnv = ({ primary, old }) => {
  if (primary) process.env.CREDENTIALS_ENCRYPTION_KEY = primary;
  else delete process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (old) process.env.CREDENTIALS_ENCRYPTION_KEY_OLD = old;
  else delete process.env.CREDENTIALS_ENCRYPTION_KEY_OLD;
};

const KEY_A = hexKey();
const KEY_B = hexKey();
const KEY_C = hexKey();
const SECRET = "ServerPassword!42";

// --- basic roundtrip ---------------------------------------------------------
console.log("\n## roundtrip");
setEnv({ primary: KEY_A });
const encryptedA = encryptSecretForStorage(SECRET);
ok("prefix applied", isEncryptedSecret(encryptedA), true);
ok("decrypt roundtrip", decryptSecretFromStorage(encryptedA), SECRET);
ok("encrypt is idempotent", encryptSecretForStorage(encryptedA), encryptedA);
ok("empty stays empty", encryptSecretForStorage(""), "");
ok("plaintext passes through", decryptSecretFromStorage("plain-secret"), "plain-secret");

// --- key change without the old key ------------------------------------------
console.log("\n## key change without old key");
setEnv({ primary: KEY_B });
throws("old ciphertext undecryptable without previous key", () =>
  decryptSecretFromStorage(encryptedA),
);

// --- key change with the old key ---------------------------------------------
console.log("\n## key change with CREDENTIALS_ENCRYPTION_KEY_OLD");
setEnv({ primary: KEY_B, old: KEY_A });
ok("old ciphertext decrypts via previous key", decryptSecretFromStorage(encryptedA), SECRET);

const rotation = decryptSecretWithRotation(encryptedA);
ok("rotation reports plaintext", rotation.value, SECRET);
ok("rotation offers re-encrypted value", isEncryptedSecret(rotation.rotatedValue), true);
ok("re-encrypted value decrypts with new key", decryptSecretFromStorage(rotation.rotatedValue), SECRET);
ok("re-encrypted value differs from old ciphertext", rotation.rotatedValue !== encryptedA, true);

ok("current-key value needs no rotation", decryptSecretWithRotation(encryptSecretForStorage(SECRET)), {
  value: SECRET,
  rotatedValue: null,
});

// --- rotateEncryptedSecret -----------------------------------------------------
console.log("\n## rotateEncryptedSecret");
const rotated = rotateEncryptedSecret(encryptedA);
ok("old-key ciphertext is re-encrypted", rotated !== encryptedA, true);
ok("rotated value decrypts with primary", decryptSecretFromStorage(rotated), SECRET);
ok("rotation is idempotent", rotateEncryptedSecret(rotated), rotated);
ok("plaintext untouched", rotateEncryptedSecret("plain-secret"), "plain-secret");
ok("empty untouched", rotateEncryptedSecret(""), "");

// --- chained rotations ---------------------------------------------------------
console.log("\n## chained rotations");
const encryptedB = encryptSecretForStorage(SECRET);
setEnv({ primary: KEY_C, old: `${KEY_B},${KEY_A}` });
ok("newest previous key tried", decryptSecretFromStorage(encryptedB), SECRET);
ok("oldest previous key still accepted", decryptSecretFromStorage(encryptedA), SECRET);

// --- invalid keys ---------------------------------------------------------------
console.log("\n## invalid keys");
setEnv({ primary: "not-a-key" });
throws("malformed primary key rejected", () => encryptSecretForStorage(SECRET));
setEnv({ primary: KEY_A, old: "nope" });
throws("malformed previous key rejected", () => decryptSecretFromStorage(encryptedA));
setEnv({ primary: KEY_A });

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
