import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('shows the public landing page for unauthenticated visitors', async () => {
    render(<App />);

    // Unauthenticated users must land on the marketing page, not a redirect loop.
    expect(await screen.findByRole('button', { name: /get started free/i })).toBeInTheDocument();
    expect(screen.getByText(/PDFs at Scale/)).toBeInTheDocument();
  });
});
