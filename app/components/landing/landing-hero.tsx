import { Link } from "react-router";
import { ArrowRight, BookOpen, CheckCircle2, Trophy } from "lucide-react";
import { Button } from "~/components/ui/button";
import { IconTile } from "./icon-tile";

const highlights = [
  {
    icon: BookOpen,
    title: "Structured courses",
    description: "Modules and lessons in the order you should learn them.",
  },
  {
    icon: CheckCircle2,
    title: "Track your progress",
    description: "Pick up exactly where you left off, on any lesson.",
  },
  {
    icon: Trophy,
    title: "Quizzes that check it stuck",
    description:
      "Short quizzes at the end of a lesson confirm what you learned.",
  },
];

export function LandingHero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-20 text-left lg:grid-cols-[3fr_2fr] lg:py-28">
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
          <span className="size-1.5 rounded-full bg-primary" />
          Self-paced courses for developers
        </p>
        <h1 className="mt-6 text-5xl font-bold tracking-tight sm:text-6xl">
          Learn to code,
          <br />
          <span className="text-muted-foreground">at your own pace</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Structured courses built by experienced instructors. Track your
          progress, take quizzes, and build real-world skills.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Button asChild size="lg">
            <Link to="/courses">
              Browse Courses
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            {signedIn ? (
              <Link to="/dashboard">Go to your dashboard</Link>
            ) : (
              <Link to="/signup">Create a free account</Link>
            )}
          </Button>
        </div>
      </div>
      <ul className="space-y-6 rounded-xl border border-border bg-muted/40 p-8">
        {highlights.map(({ icon, title, description }) => (
          <li key={title} className="flex items-start gap-4">
            <IconTile icon={icon} size="md" />
            <div>
              <p className="font-semibold">{title}</p>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
