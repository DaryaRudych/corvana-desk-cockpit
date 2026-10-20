// Small inline icons (no icon library).
type Props = { className?: string }

export const LockIcon = ({ className = 'size-3' }: Props) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
    <path d="M5 7V5a3 3 0 1 1 6 0v2h.5A1.5 1.5 0 0 1 13 8.5v5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13.5v-5A1.5 1.5 0 0 1 4.5 7H5Zm1.5 0h3V5a1.5 1.5 0 1 0-3 0v2Z" />
  </svg>
)

export const AlertIcon = ({ className = 'size-3' }: Props) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
    <path d="M7.13 2.5a1 1 0 0 1 1.74 0l5.6 9.75A1 1 0 0 1 13.6 13.75H2.4a1 1 0 0 1-.87-1.5L7.13 2.5ZM8 6a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 6Zm0 6a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z" />
  </svg>
)

export const ChevronIcon = ({ className = 'size-3' }: Props) => (
  <svg viewBox="0 0 16 16" fill="currentColor" className={className} aria-hidden="true">
    <path d="M6.22 4.22a.75.75 0 0 1 1.06 0l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.75.75 0 0 1-1.06-1.06L8.94 8 6.22 5.28a.75.75 0 0 1 0-1.06Z" />
  </svg>
)
