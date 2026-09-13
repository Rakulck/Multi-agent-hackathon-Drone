export function MapLoadingState() {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-white/85 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-[22px] border border-neutral-200 bg-white/95 px-6 py-5 shadow-[0_12px_36px_rgba(0,0,0,0.12)]">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-600">Loading 3D environment...</p>
      </div>
    </div>
  );
}
