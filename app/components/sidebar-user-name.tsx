export function SidebarUserName({ name }: { name: string }) {
  return (
    <div title={name} className="line-clamp-2 break-words text-sm font-medium">
      {name}
    </div>
  );
}
