import type { HTMLAttributes } from 'react';

/** Superfície de vidro fosco do overlay. */
export function Glass({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`glass ${className}`} {...props} />;
}
