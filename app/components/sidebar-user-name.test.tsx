import { describe, expect, it } from "vitest";
import { SidebarUserName } from "./sidebar-user-name";

function render(name: string) {
  const { props } = SidebarUserName({ name });
  return {
    text: props.children as string,
    title: props.title as string,
    classes: (props.className as string).split(" "),
  };
}

describe("SidebarUserName", () => {
  it("shows the full name", () => {
    expect(render("Emma Wilson").text).toBe("Emma Wilson");
  });

  it("wraps onto a second line instead of cutting the name off", () => {
    const { classes } = render("Emma Wilson");
    expect(classes).toContain("line-clamp-2");
    expect(classes).toContain("break-words");
    expect(classes).not.toContain("truncate");
  });

  it("puts the full name in a tooltip for names too long for two lines", () => {
    const name = "Maximiliana Wolfeschlegelsteinhausenbergerdorff";
    expect(render(name).title).toBe(name);
  });
});
