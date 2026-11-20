import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarUserName } from "./sidebar-user-name";

function renderName(name: string) {
  const html = renderToStaticMarkup(<SidebarUserName name={name} />);
  const classes = /class="([^"]*)"/.exec(html)?.[1].split(" ") ?? [];
  return { html, classes };
}

describe("SidebarUserName", () => {
  it("shows the full name", () => {
    expect(renderName("Emma Wilson").html).toContain(">Emma Wilson</");
  });

  it("wraps onto a second line instead of cutting the name off", () => {
    const { classes } = renderName("Emma Wilson");
    expect(classes).toContain("line-clamp-2");
    expect(classes).toContain("break-words");
    expect(classes).not.toContain("truncate");
  });

  it("puts the full name in a tooltip, for names longer than two lines", () => {
    const name = "Maximiliana Wolfeschlegelsteinhausenbergerdorff";
    expect(renderName(name).html).toContain(`title="${name}"`);
  });
});
