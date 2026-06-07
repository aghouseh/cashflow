declare const __APP_VERSION__: string

declare namespace React {
  interface AnchorHTMLAttributes<T> {
    interestfor?: string
    popover?: 'auto' | 'manual' | 'hint' | ''
  }
  interface HTMLAttributes<T> {
    popover?: 'auto' | 'manual' | 'hint' | ''
    interestfor?: string
  }
}
