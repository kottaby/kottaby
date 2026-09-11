import { afterEach, describe, expect, test } from "bun:test";
import { cleanup } from "@testing-library/react";

import { HeroParticles } from "@/frontend/views/landing/sections/hero/HeroParticles";
import { renderWithWrapper } from "@/test/ui/components/TestWrapper";

afterEach(cleanup);

describe("HeroParticles", () => {
  test("renders 25 particle elements inside aria-hidden container", () => {
    const { container } = renderWithWrapper(<HeroParticles />);
    const outerBox = container.firstElementChild;
    expect(outerBox).not.toBeNull();
    expect(outerBox?.getAttribute("aria-hidden")).toBe("true");
    expect(outerBox?.children.length).toBe(25);
  });
});
