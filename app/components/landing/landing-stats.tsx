import { BookOpen, GraduationCap, Users } from "lucide-react";

export function LandingStats({
  totalCourses,
  totalCategories,
}: {
  totalCourses: number;
  totalCategories: number;
}) {
  const stats = [
    { icon: BookOpen, value: String(totalCourses), label: "Available Courses" },
    {
      icon: GraduationCap,
      value: String(totalCategories),
      label: "Categories",
    },
    { icon: Users, value: "Self-paced", label: "Learn on your schedule" },
  ];

  return (
    <section className="border-y border-border bg-muted/50 py-12">
      <ul className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 text-left sm:grid-cols-3">
        {stats.map(({ icon: Icon, value, label }) => (
          <li key={label} className="flex items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="size-6 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-sm text-muted-foreground">{label}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
