import { describe, expect, test } from "bun:test";
import {
  applySpaceZCorsHeaders,
  isAllowedPreviewOrigin,
  spaceZCorsPreflightResponse,
} from "@/app/api/graphql/space-z-cors";

describe("space-z-cors origin validation & headers", () => {
  describe("isAllowedPreviewOrigin", () => {
    test("allows exact domain space-z.ai and subdomains", () => {
      expect(isAllowedPreviewOrigin("https://space-z.ai")).toBe(true);
      expect(isAllowedPreviewOrigin("https://preview.space-z.ai")).toBe(true);
      expect(isAllowedPreviewOrigin("https://dev.preview.space-z.ai")).toBe(true);
      expect(isAllowedPreviewOrigin("https://preview.space-z.ai:8080")).toBe(true);
    });

    test("rejects untrusted or lookalike domain origins", () => {
      expect(isAllowedPreviewOrigin("https://evil-space-z.ai")).toBe(false);
      expect(isAllowedPreviewOrigin("https://space-z.ai.attacker.com")).toBe(false);
      expect(isAllowedPreviewOrigin("https://evil.com")).toBe(false);
    });

    test("rejects malformed origins and null/undefined values", () => {
      expect(isAllowedPreviewOrigin(null)).toBe(false);
      expect(isAllowedPreviewOrigin("")).toBe(false);
      expect(isAllowedPreviewOrigin("not-a-url")).toBe(false);
    });
  });

  describe("applySpaceZCorsHeaders", () => {
    test("sets CORS headers for valid preview origins", () => {
      const headers = new Headers();
      applySpaceZCorsHeaders(headers, "https://preview.space-z.ai");
      expect(headers.get("Access-Control-Allow-Origin")).toBe("https://preview.space-z.ai");
      expect(headers.get("Access-Control-Allow-Credentials")).toBe("true");
    });

    test("does not set CORS headers for untrusted origins", () => {
      const headers = new Headers();
      applySpaceZCorsHeaders(headers, "https://evil-space-z.ai");
      expect(headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(headers.get("Access-Control-Allow-Credentials")).toBeNull();
    });
  });

  describe("spaceZCorsPreflightResponse", () => {
    test("returns 204 with CORS headers for valid preview origin", () => {
      const response = spaceZCorsPreflightResponse("https://preview.space-z.ai");
      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://preview.space-z.ai");
      expect(response.headers.get("Access-Control-Max-Age")).toBe("86400");
    });

    test("returns 403 for untrusted origins", () => {
      const response = spaceZCorsPreflightResponse("https://evil-space-z.ai");
      expect(response.status).toBe(403);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    });
  });
});
