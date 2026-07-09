import React from 'react';

export default function Button({
  children,
  onClick,
  appearance = 'default',
  isDisabled = false,
  isLoading = false,
  size,
  type = 'button',
  title,
}) {
  const cls = ['btn', `btn--${appearance}`, size === 'sm' ? 'btn--sm' : ''].filter(Boolean).join(' ');
  return (
    <button
      type={type}
      className={cls}
      onClick={onClick}
      disabled={isDisabled || isLoading}
      title={title}
    >
      {isLoading && <span className="btn-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
