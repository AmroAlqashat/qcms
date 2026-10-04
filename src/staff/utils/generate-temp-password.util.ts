import { randomBytes } from "node:crypto";

export function generateTempPassword(): string {
  // Generate 12 char random temp string password.
  return randomBytes(9).toString('base64url');
}
