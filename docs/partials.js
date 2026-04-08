// Shared HTML partials for docs pages, injected via vite-plugin-html EJS templates

export const header = `
<header class="docs-header">
  <div class="docs-header-inner">
    <a href="/docs/" class="docs-logo">
      <img src="/logo.webp" alt="SpicePad" class="header-logo">
      <span class="docs-title">Docs</span>
    </a>
    <nav class="docs-header-nav">
      <a href="/">App</a>
      <a href="https://github.com/nicerikor/spicepad" target="_blank" rel="noopener">GitHub</a>
    </nav>
  </div>
</header>
`;

export const nav = `
<nav class="docs-sidebar" id="docs-nav">
  <ul>
    <li><a href="/docs/">Home</a></li>
    <li><a href="/docs/getting-started.html">Getting Started</a></li>
    <li><a href="/docs/loading-saving.html">Loading &amp; Saving</a></li>
  </ul>
</nav>
`;

export const footer = `
<footer class="docs-footer">
  <p>&copy; ${new Date().getFullYear()} SpicePad</p>
</footer>
`;
