type Props = {
  title: string;
  description: string;
};

export default function PlaceholderScreen({ title, description }: Props) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section>
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </section>
      <section className="rounded-lg border border-dashed border-line bg-white p-8 text-center">
        <h2 className="text-sm font-semibold">Coming next</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          This tab is part of a later build session. The Well Twin tab is live
          and wired to the real API.
        </p>
      </section>
    </div>
  );
}
