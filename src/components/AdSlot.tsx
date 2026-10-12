import { cn } from 'tailwind-variants'

/** Espaço reservado para anúncio (slot identificável p/ o ad server). */
export function AdSlot({
  slot,
  className
}: {
  slot: string
  className?: string
}) {
  return (
    <div
      role="complementary"
      aria-label={`Anúncio ${slot}`}
      data-ad-slot={slot}
      className={cn(
        'border-woodsmoke-800 bg-woodsmoke-900/40 flex items-center justify-center rounded-xl border border-dashed',
        className
      )}
    >
      <p className="text-woodsmoke-600 text-[10px] font-semibold tracking-[0.2em] uppercase">
        Anúncio
      </p>
    </div>
  )
}
