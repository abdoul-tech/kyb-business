import { describe, expect, it } from "vitest";
import { formatDisplayDate, isIsoDate } from "../src/index.js";

describe("isIsoDate", () => {
  it("accepte une date ISO existante, y compris un 01/01", () => {
    expect(isIsoDate("1980-01-01")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
  });

  it("refuse un autre format ou une date qui n'existe pas", () => {
    expect(isIsoDate("01/01/1980")).toBe(false);
    expect(isIsoDate("1980-1-1")).toBe(false);
    expect(isIsoDate("2023-02-29")).toBe(false);
    expect(isIsoDate("2023-13-01")).toBe(false);
    expect(isIsoDate("")).toBe(false);
  });
});

describe("formatDisplayDate", () => {
  it("affiche en JJ/MM/AAAA sans rien corriger", () => {
    expect(formatDisplayDate("1980-01-01")).toBe("01/01/1980");
    expect(formatDisplayDate("2019-03-14")).toBe("14/03/2019");
  });

  it("refuse une date invalide", () => {
    expect(() => formatDisplayDate("1980-02-30")).toThrow();
  });
});
