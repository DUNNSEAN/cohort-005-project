import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { LandingHero } from "./landing-hero";
import { LandingStats } from "./landing-stats";
import { LandingFooter } from "./landing-footer";

function render(node: ReactNode) {
  return renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
}

function hrefs(markup: string) {
  return [...markup.matchAll(/href="([^"]*)"/g)].map((match) => match[1]);
}

const centred = /\btext-center\b/;

describe("LandingHero", () => {
  it("left-aligns the headline and its call to action", () => {
    const hero = render(<LandingHero signedIn={false} />);

    expect(hero).toContain("Learn to code,");
    expect(hero).toMatch(/<section class="[^"]*\btext-left\b/);
    expect(hero).not.toMatch(centred);
  });

  it("offers a signed-out visitor an account", () => {
    expect(hrefs(render(<LandingHero signedIn={false} />))).toEqual([
      "/courses",
      "/signup",
    ]);
  });

  it("sends a signed-in visitor to their dashboard", () => {
    expect(hrefs(render(<LandingHero signedIn={true} />))).toEqual([
      "/courses",
      "/dashboard",
    ]);
  });
});

describe("LandingStats", () => {
  it("shows the course and category counts, left-aligned", () => {
    const stats = render(<LandingStats totalCourses={4} totalCategories={5} />);

    expect(stats).toMatch(/>4<\/p><p[^>]*>Available Courses</);
    expect(stats).toMatch(/>5<\/p><p[^>]*>Categories</);
    expect(stats).toMatch(/>Self-paced<\/p><p[^>]*>Learn on your schedule</);
    expect(stats).toMatch(/<ul class="[^"]*\btext-left\b/);
    expect(stats).not.toMatch(centred);
  });
});

describe("LandingFooter", () => {
  it("links to the catalogue without centring", () => {
    const footer = render(<LandingFooter />);

    expect(hrefs(footer)).toEqual(["/courses"]);
    expect(footer).not.toMatch(centred);
  });
});
