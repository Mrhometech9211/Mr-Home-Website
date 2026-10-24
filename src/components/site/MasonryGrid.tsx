import { cn } from "@/lib/utils";

export function MasonryGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("columns-1 gap-4 sm:columns-2 lg:columns-3", className)}>{children}</div>;
}
