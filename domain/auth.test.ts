import {
  cleanCode,
  firstNameFromEmail,
  isStrongPassword,
  isValidEmail,
  normaliseEmail,
  passwordRules,
  shortEmail,
} from "./auth";

describe("account rules", () => {
  it("checks emails loosely", () => {
    expect(isValidEmail("leo@routineraccoon.app")).toBe(true);
    expect(isValidEmail(" Leo@Example.COM ")).toBe(true);
    expect(isValidEmail("leo@local")).toBe(false);
    expect(isValidEmail("not an email")).toBe(false);
    expect(normaliseEmail(" Leo@Example.COM ")).toBe("leo@example.com");
  });

  it("password rules: length and a number or symbol", () => {
    expect(passwordRules("short1").map((r) => r.ok)).toEqual([false, true]);
    expect(passwordRules("longenoughpassword").map((r) => r.ok)).toEqual([true, false]);
    expect(isStrongPassword("tigers4ever!")).toBe(true);
    expect(isStrongPassword("tigers_forever")).toBe(true);
  });

  it("derives a greeting, a short email and a clean code", () => {
    expect(firstNameFromEmail("sam.rivera@gmail.com")).toBe("Sam");
    expect(firstNameFromEmail("@x.com")).toBe("there");
    expect(shortEmail("leo@routineraccoon.app")).toBe("leo@…");
    expect(cleanCode("482 913x7")).toBe("482913");
  });
});
