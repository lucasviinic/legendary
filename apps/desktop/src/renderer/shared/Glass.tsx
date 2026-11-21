import type { HTMLAttributes } from 'react';

export function Glass({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`glass ${className}`} {...props} />;
}
