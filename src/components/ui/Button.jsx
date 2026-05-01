import React from 'react';

// Variants: 'primary' (teal solid) | 'secondary' (outlined) | 'ghost' (text-only) | 'danger'
// Sizes: 'sm' | 'md' (default) | 'lg'
// Pass any other inline style overrides via `style` to keep existing pages flexible.

const VARIANT_STYLES = {
  primary: {
    background: 'var(--accent)',
    color: '#fff',
    border: 'none',
  },
  secondary: {
    background: 'var(--card)',
    color: 'var(--text)',
    border: '1px solid var(--border)',
  },
  ghost: {
    background: 'none',
    color: 'var(--accent)',
    border: 'none',
  },
  outline: {
    background: 'var(--card)',
    color: 'var(--accent)',
    border: '1px solid var(--accent)',
  },
  danger: {
    background: 'var(--red)',
    color: '#fff',
    border: 'none',
  },
};

const SIZE_STYLES = {
  sm: { padding: '5px 12px', fontSize: 'var(--text-xs)' },
  md: { padding: '8px 18px', fontSize: 'var(--text-sm)' },
  lg: { padding: '12px 28px', fontSize: 'var(--text-md)' },
};

function Button({children, variant = 'secondary', size = 'md', disabled, onClick, type = 'button', title, style, ...rest}) {
  const v = VARIANT_STYLES[variant] || VARIANT_STYLES.secondary;
  const s = SIZE_STYLES[size] || SIZE_STYLES.md;
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        ...v,
        ...s,
        borderRadius: 'var(--r-pill)',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background var(--t-fast), opacity var(--t-fast)',
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
        ...style,
      }}
      {...rest}
    >
      {children}
    </button>
  );
}

export default Button;
