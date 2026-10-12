import { cn } from 'tailwind-variants'

export type Office = 'presidente' | 'governadores' | 'senado' | 'deputados'

const TABS: { value: Office; label: string }[] = [
  { value: 'presidente', label: 'Presidente' },
  { value: 'governadores', label: 'Governadores' },
  { value: 'senado', label: 'Senado' },
  { value: 'deputados', label: 'Deputados' }
]

/** Abas de cargo em disputa (barra única, estilo pílula). */
export function OfficeTabs({
  value,
  onChange,
  className
}: {
  value: Office
  onChange: (next: Office) => void
  className?: string
}) {
  return (
    <div
      role="tablist"
      aria-label="Cargo em disputa"
      className={cn(
        'border-woodsmoke-800 bg-woodsmoke-900/90 flex items-center gap-1 overflow-x-auto rounded-full border px-1 py-1 shadow-xl backdrop-blur',
        className
      )}
    >
      {TABS.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'rounded-full px-3 py-1 text-[11px] font-semibold whitespace-nowrap transition-colors',
            value === t.value
              ? 'border-woodsmoke-600 bg-woodsmoke-800 text-woodsmoke-50 border'
              : 'text-woodsmoke-400 hover:text-woodsmoke-200'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
