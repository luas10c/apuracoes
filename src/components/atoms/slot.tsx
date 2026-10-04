'use client'

import { cloneElement, isValidElement, type ReactElement, type Ref } from 'react'

import { cn } from '#/utils/cn'

export function Slot({
  children,
  className,
  ...props
}: React.ComponentProps<'div'> & { children: ReactElement }) {
  if (!isValidElement(children)) return null
  const childProps = children.props as Record<string, unknown>
  return cloneElement(children, {
    ...props,
    ...childProps,
    className: cn(childProps.className as string | undefined, className),
    ref: (children as { ref?: Ref<unknown> }).ref
  } as never)
}
