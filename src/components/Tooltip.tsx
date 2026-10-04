type TooltipProps = {
  x: number
  y: number
  children: React.ReactNode
  maxLeft?: number
}

export function Tooltip({ x, y, children, maxLeft }: TooltipProps) {
  return (
    <div
      role="tooltip"
      className="border-woodsmoke-700 bg-woodsmoke-800 text-woodsmoke-100 pointer-events-none absolute z-50 overflow-hidden rounded-md border px-3 py-1.5 text-xs text-balance shadow-md"
      style={{
        left: maxLeft != null ? Math.min(x, maxLeft) : x,
        top: y,
        transform: 'translate(12px, 12px)'
      }}
    >
      {children}
    </div>
  )
}
