import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import App from './App';

describe('App', () => {
  it('renders the projects page by default', async () => {
    render(<App />);

    expect(await screen.findByText('Your Projects')).toBeInTheDocument();
  });
});
