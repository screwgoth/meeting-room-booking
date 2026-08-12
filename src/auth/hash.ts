import argon2 from 'argon2';

/**
 * Password hashing (§7). argon2id with sane memory/time cost. Verification is
 * constant-time via argon2.verify. We never store or log plaintext.
 */
const OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(
  hash: string,
  plain: string,
): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Malformed hash etc. — treat as non-match, never throw to the caller.
    return false;
  }
}
