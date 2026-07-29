import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hashPassword } from "../src/lib/admin/password";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const USERNAME = process.env.ADMIN_USERNAME || "abel";
const MIN_LENGTH = 12; // matches create-admin.ts's own floor

const CTRL_C = String.fromCharCode(3);
const BACKSPACE = String.fromCharCode(127);

/**
 * Reads a line from the terminal without echoing it back — never via a CLI
 * arg (those land in shell history) and never logged. Requires a real TTY;
 * refuses to silently fall back to a visible prompt.
 */
function readHiddenInput(promptText: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      reject(
        new Error(
          "No interactive TTY available. Set ADMIN_NEW_PASSWORD instead (see caveat in the command below about shell history)."
        )
      );
      return;
    }

    process.stdout.write(promptText);
    process.stdin.resume();
    process.stdin.setEncoding("utf8");
    process.stdin.setRawMode(true);

    let input = "";
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === "\n" || char === "\r") {
          cleanup();
          process.stdout.write("\n");
          resolve(input);
          return;
        }
        if (char === CTRL_C) {
          cleanup();
          process.stdout.write("\n");
          reject(new Error("Aborted."));
          return;
        }
        if (char === BACKSPACE || char === "\b") {
          input = input.slice(0, -1);
          continue;
        }
        input += char;
      }
    };
    function cleanup() {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener("data", onData);
    }
    process.stdin.on("data", onData);
  });
}

async function main() {
  const existing = await prisma.admin.findUnique({ where: { username: USERNAME } });
  if (!existing) {
    console.error(`No Admin row found with username "${USERNAME}". Nothing was changed.`);
    process.exitCode = 1;
    return;
  }

  const envPassword = process.env.ADMIN_NEW_PASSWORD;
  let password: string;

  if (envPassword !== undefined) {
    password = envPassword;
  } else {
    password = await readHiddenInput(`New password for admin "${USERNAME}": `);
    const confirmed = await readHiddenInput("Confirm new password: ");
    if (password !== confirmed) {
      console.error("Passwords did not match. Nothing was changed.");
      process.exitCode = 1;
      return;
    }
  }

  if (password.length < MIN_LENGTH) {
    console.error(`Password must be at least ${MIN_LENGTH} characters. Nothing was changed.`);
    process.exitCode = 1;
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.admin.update({ where: { username: USERNAME }, data: { passwordHash } });

  console.log(`Password updated for admin "${USERNAME}" (id: ${existing.id}).`);
}

main()
  .catch((err) => {
    console.error("Failed:", err instanceof Error ? err.message : "Unknown error");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
