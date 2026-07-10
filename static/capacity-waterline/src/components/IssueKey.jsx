import React from 'react';
import { router } from '@forge/bridge';

// Renders an issue key as a clickable link that opens the issue in a new tab.
// Uses router.open() from @forge/bridge to escape the sandboxed iframe.
export default function IssueKey({ issueKey, siteUrl, style }) {
  const href = siteUrl ? `${siteUrl}/browse/${issueKey}` : null;
  const base = {
    fontSize: 12,
    color: 'var(--text-subtlest)',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    marginRight: 4,
    textDecoration: 'none',
    background: 'none',
    border: 'none',
    padding: 0,
    cursor: href ? 'pointer' : 'default',
    ...style,
  };

  if (!href) {
    return <span style={base}>{issueKey}</span>;
  }

  return (
    <button
      style={base}
      onClick={() => router.open(href)}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--brand)'; e.currentTarget.style.textDecoration = 'underline'; }}
      onMouseLeave={e => { e.currentTarget.style.color = base.color; e.currentTarget.style.textDecoration = 'none'; }}
    >
      {issueKey}
    </button>
  );
}
