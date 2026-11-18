export default function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="m-0 px-1 font-display text-heading-sm font-semibold leading-heading-sm tracking-heading-sm text-charcoal">
        {title}
      </h2>
      {children}
    </section>
  );
}
