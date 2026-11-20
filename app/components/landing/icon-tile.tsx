import type { LucideIcon } from "lucide-react";

const sizes = {
  md: { tile: "size-10", icon: "size-5" },
  lg: { tile: "size-12", icon: "size-6" },
};

export function IconTile({
  icon: Icon,
  size,
}: {
  icon: LucideIcon;
  size: keyof typeof sizes;
}) {
  return (
    <div
      className={`flex ${sizes[size].tile} shrink-0 items-center justify-center rounded-lg bg-primary/10`}
    >
      <Icon className={`${sizes[size].icon} text-primary`} />
    </div>
  );
}
