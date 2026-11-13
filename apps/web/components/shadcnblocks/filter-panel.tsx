import { cn } from "cn"

function FilterPanel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="filter-panel"
      className={cn("flex w-full min-w-0 flex-col gap-5", className)}
      {...props}
    />
  )
}

function FilterPanelSection({
  title,
  className,
  children,
  ...props
}: React.ComponentProps<"section"> & { title: string }) {
  return (
    <section
      data-slot="filter-panel-section"
      className={cn(
        "border-border flex flex-col gap-3 border-b border-dotted pb-5 last:border-b-0 last:pb-0",
        className
      )}
      {...props}
    >
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </section>
  )
}

function FilterPanelOption({
  count,
  active = false,
  className,
  children,
  ...props
}: React.ComponentProps<"button"> & { count?: number; active?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      data-slot="filter-panel-option"
      data-active={active ? "true" : "false"}
      className={cn(
        "hover:bg-muted flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm",
        active && "bg-muted font-medium",
        className
      )}
      {...props}
    >
      <span>{children}</span>
      {count !== undefined ? (
        <span className="text-muted-foreground tabular-nums">{count}</span>
      ) : null}
    </button>
  )
}

export { FilterPanel, FilterPanelOption, FilterPanelSection }
