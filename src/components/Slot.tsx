import { isValidElement, forwardRef, Children, cloneElement } from 'react'

export type SlottableProps = React.PropsWithChildren

export function Slottable({ children }: SlottableProps): React.ReactElement {
  return <>{children}</>
}

export function isSlottable(
  child: React.ReactNode
): child is React.ReactElement<SlottableProps> {
  return isValidElement(child) && child.type === Slottable
}

type AnyProps = Record<string, unknown>

/**
 * Reads the ref from an element in a way compatible with React 18 and 19.
 * React 19 warns when accessing `element.ref` directly.
 */
export function getElementRef<T = unknown>(
  element: React.ReactElement
): React.Ref<T> | undefined {
  const props = element.props as { ref?: React.Ref<T> }
  return (
    props.ref ?? (element as unknown as { ref?: React.Ref<T> }).ref ?? undefined
  )
}

export function composeRefs<T>(
  ...refs: (React.Ref<T> | undefined | null)[]
): React.RefCallback<T> {
  return (node: T | null) => {
    for (const ref of refs) {
      if (typeof ref === 'function') {
        ref(node)
      } else if (ref != null) {
        ;(ref as React.RefObject<T | null>).current = node
      }
    }
  }
}

/**
 * Merges Slot props with child props:
 * - Event handlers are composed (child runs first)
 * - `style` is shallowly merged (child overrides)
 * - `className` is concatenated
 * - All other props: child takes precedence
 */
export function mergeProps(
  slotProps: AnyProps,
  childProps: AnyProps
): AnyProps {
  const merged: AnyProps = { ...slotProps, ...childProps }

  for (const key in childProps) {
    const slotVal = slotProps[key]
    const childVal = childProps[key]

    if (
      /^on[A-Z]/.test(key) &&
      typeof slotVal === 'function' &&
      typeof childVal === 'function'
    ) {
      merged[key] = (...args: unknown[]) => {
        ;(childVal as (...a: unknown[]) => void)(...args)
        ;(slotVal as (...a: unknown[]) => void)(...args)
      }
      continue
    }

    if (key === 'style') {
      merged[key] = {
        ...(slotVal as React.CSSProperties | undefined),
        ...(childVal as React.CSSProperties | undefined)
      }
      continue
    }

    if (key === 'className') {
      merged[key] = [slotVal, childVal].filter(Boolean).join(' ') || undefined
      continue
    }
  }

  return merged
}

export interface SlotCloneProps {
  children?: React.ReactNode
  [key: string]: unknown
}

export const SlotClone = forwardRef<HTMLElement, SlotCloneProps>(
  ({ children, ...slotProps }, forwardedRef) => {
    if (!isValidElement(children)) {
      if (Children.count(children) > 1) {
        throw new Error(
          '[Slot] When not using <Slottable>, pass exactly one valid React child.'
        )
      }
      return null
    }

    const childRef = getElementRef<HTMLElement>(children)
    const composedRef =
      forwardedRef || childRef
        ? composeRefs<HTMLElement>(
            forwardedRef ?? undefined,
            childRef ?? undefined
          )
        : undefined

    return cloneElement(children, {
      ...mergeProps(slotProps, children.props as AnyProps),
      ...(composedRef ? { ref: composedRef } : {})
    } as React.HTMLAttributes<HTMLElement> & React.RefAttributes<HTMLElement>)
  }
)

SlotClone.displayName = 'SlotClone'

export type SlotProps<T extends React.ElementType = 'span'> =
  React.ComponentPropsWithRef<T> & {
    children?: React.ReactNode
    asChild?: boolean
  }

/**
 * A `Slot` component compatible with @radix-ui/react-slot.
 *
 * Delegates rendering to its immediate child, merging props
 * (including event handlers and className) and composing refs.
 *
 * Supports the advanced `<Slottable>` API for composite layouts.
 *
 * @example Basic usage
 * <Slot onClick={handleClick} className="btn">
 *   <button>Click me</button>
 * </Slot>
 *
 * @example With Slottable (composite layout)
 * <Slot>
 *   <span className="icon">🔒</span>
 *   <Slottable>
 *     <button>Sign in</button>
 *   </Slottable>
 * </Slot>
 */
export const Slot = forwardRef<HTMLElement, SlotProps>(
  ({ children, ...slotProps }, forwardedRef) => {
    const childrenArray = Children.toArray(children)
    const slottable = childrenArray.find(isSlottable)

    if (!slottable) {
      return (
        <SlotClone ref={forwardedRef} {...slotProps}>
          {children}
        </SlotClone>
      )
    }

    const targetElement = slottable.props.children

    if (!isValidElement(targetElement)) {
      return null
    }

    const targetChildren = (
      targetElement.props as { children?: React.ReactNode }
    ).children

    const newChildren = childrenArray.map((child) =>
      child === slottable
        ? isValidElement(targetChildren)
          ? targetChildren
          : null
        : child
    )

    return (
      <SlotClone ref={forwardedRef} {...slotProps}>
        {cloneElement(targetElement, undefined, ...newChildren.filter(Boolean))}
      </SlotClone>
    )
  }
)

Slot.displayName = 'Slot'
