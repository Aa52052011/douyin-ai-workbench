export function CapabilityStatus({
  name,
  available,
  notConfiguredHint,
  fallback,
}: {
  name: string;
  available: boolean;
  notConfiguredHint: string;
  fallback?: string;
}) {
  return (
    <div className="rounded-md border border-neutral-200 px-3 py-2 text-sm">
      <p className="font-medium">{name}</p>
      <p className="mt-1 text-neutral-600">{available ? "可用" : notConfiguredHint}</p>
      {!available && fallback ? <p className="mt-1 text-neutral-500">{fallback}</p> : null}
    </div>
  );
}
