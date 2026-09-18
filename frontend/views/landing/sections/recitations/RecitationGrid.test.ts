import { describe, expect, test } from "bun:test";
import { RecitationGrid } from "./RecitationGrid";

describe("RecitationGrid", () => {
  test("is memoized with React.memo", () => {
    expect(typeof RecitationGrid).toBe("object");
    const gridObj = Object.assign({}, RecitationGrid);
    expect(gridObj.$$typeof).toBe(Symbol.for("react.memo"));
  });
});
