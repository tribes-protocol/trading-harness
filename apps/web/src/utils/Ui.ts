import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/** `1234.5678` -> `$1,234.57`. Costs are always shown with two decimals. */
export function formatUsd(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

/** `0.372` -> `37%`. Input is already a percentage, not a ratio. */
export function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}
