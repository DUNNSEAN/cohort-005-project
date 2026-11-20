import { Link } from "react-router";

export function LandingFooter() {
  return (
    <footer className="border-t border-border py-8">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">Cadence</span>
        <Link to="/courses" className="transition-colors hover:text-foreground">
          Browse courses
        </Link>
      </div>
    </footer>
  );
}
