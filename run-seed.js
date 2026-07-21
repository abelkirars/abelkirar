#!/usr/bin/env node
import { spawn } from "child_process";

const proc = spawn("node", ["--import", "tsx", "prisma/seed.ts"], {
  cwd: process.cwd(),
  stdio: "inherit",
});

proc.on("close", (code) => {
  console.log(`Seed process exited with code ${code}`);
  process.exit(code);
});
