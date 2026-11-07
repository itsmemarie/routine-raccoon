import { splitLinks } from "./links";

const links = (text: string) =>
  splitLinks(text).flatMap((part) => (part.kind === "link" ? [part.text] : []));

describe("splitLinks", () => {
  it("leaves text without an address as one plain piece", () => {
    expect(splitLinks("The number is on the fridge")).toEqual([
      { kind: "text", text: "The number is on the fridge" },
    ]);
    expect(splitLinks("")).toEqual([]);
  });

  it("finds an address in the middle of a note", () => {
    expect(splitLinks("Book at https://example.com/book today")).toEqual([
      { kind: "text", text: "Book at " },
      { kind: "link", text: "https://example.com/book", href: "https://example.com/book" },
      { kind: "text", text: " today" },
    ]);
  });

  it("finds several addresses, across lines, and keeps every character", () => {
    const note = "First http://a.example/x\nthen\n  https://b.example/y?q=1#top\nend";
    expect(links(note)).toEqual(["http://a.example/x", "https://b.example/y?q=1#top"]);
    expect(
      splitLinks(note)
        .map((part) => part.text)
        .join(""),
    ).toBe(note);
  });

  it("opens www addresses over https but shows them as typed", () => {
    expect(splitLinks("www.example.com/page")).toEqual([
      { kind: "link", text: "www.example.com/page", href: "https://www.example.com/page" },
    ]);
    expect(splitLinks("WWW.EXAMPLE.COM")).toEqual([
      { kind: "link", text: "WWW.EXAMPLE.COM", href: "https://www.example.com/" },
    ]);
  });

  it("leaves sentence punctuation outside the link", () => {
    expect(links("See https://example.com/a.")).toEqual(["https://example.com/a"]);
    expect(links("Is it https://example.com/a?")).toEqual(["https://example.com/a"]);
    expect(links("(https://example.com/a), then")).toEqual(["https://example.com/a"]);
    expect(links("[www.example.com]")).toEqual(["www.example.com"]);
    expect(links("“https://example.com/a”")).toEqual(["https://example.com/a"]);
    expect(splitLinks("See https://example.com/a.").at(-1)).toEqual({ kind: "text", text: "." });
  });

  it("keeps brackets and punctuation that belong to the address", () => {
    const wiki = "https://en.wikipedia.org/wiki/Raccoon_(disambiguation)";
    expect(links(`Read ${wiki}`)).toEqual([wiki]);
    expect(links("https://example.com/a?b=1&c=d.e")).toEqual(["https://example.com/a?b=1&c=d.e"]);
  });

  it("never links anything but a web address", () => {
    for (const text of [
      "javascript:alert(1)",
      "data:text/html,hi",
      "mailto:me@example.com",
      "ftp://example.com",
      "<script>alert(1)</script>",
      "example.com",
      "awww.example.com",
      "xhttps://example.com",
    ]) {
      expect(links(text)).toEqual([]);
    }
  });

  it("stops at characters that can't be part of the address", () => {
    expect(links('<a href="https://example.com/a">')).toEqual(["https://example.com/a"]);
    expect(links("<https://example.com/a>")).toEqual(["https://example.com/a"]);
  });

  it("leaves something that only starts like an address as plain text", () => {
    expect(links("https://[ and https://. and www.")).toEqual([]);
    expect(splitLinks("https://[")).toEqual([{ kind: "text", text: "https://[" }]);
  });
});
