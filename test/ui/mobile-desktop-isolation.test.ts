import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

interface Violation {
  file: string;
  line: string;
}

const DESKTOP_REGEX = /[\\/]desktop[\\/]/i;
const MOBILE_REGEX = /[\\/]mobile[\\/]/i;

function getAllTsFiles(dirPath: string): string[] {
  const results: string[] = [];
  try {
    const entries = readdirSync(dirPath);
    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...getAllTsFiles(fullPath));
      } else if (/\.(ts|tsx)$/.test(entry)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory might not exist or be unreadable
  }
  return results;
}

function checkFileViolations(file: string): Violation[] {
  const isDesktop = DESKTOP_REGEX.test(file);
  const isMobile = MOBILE_REGEX.test(file);

  if (!isDesktop && !isMobile) {
    return [];
  }

  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  const violations: Violation[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("import ") && !trimmed.startsWith("export ")) {
      continue;
    }

    const hasDesktopViolation = isDesktop && (line.includes("/mobile/") || line.includes("\\mobile\\"));
    const hasMobileViolation = isMobile && (line.includes("/desktop/") || line.includes("\\desktop\\"));

    if (hasDesktopViolation || hasMobileViolation) {
      violations.push({ file, line: trimmed });
    }
  }

  return violations;
}

describe("Mobile/Desktop Isolation Static Checks", () => {
  test("desktop views do not directly import mobile view components and vice-versa", () => {
    const frontendViewsDir = join(process.cwd(), "frontend", "views");
    const files = getAllTsFiles(frontendViewsDir);
    const violations = files.flatMap(file => checkFileViolations(file));

    expect(violations).toEqual([]);
  });
});
