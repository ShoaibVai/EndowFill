import { beforeEach, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { act } from 'react-dom/test-utils';
import { useAppStore } from '../store/useAppStore';

beforeEach(() => {
  // Reset minimal store state used by App
  useAppStore.setState({ activeTab: 'editor', notifications: [] });
});

test('renders the app shell and lands unauthenticated users on the marketing page', async () => {
  await act(async () => {
    render(<App />);
  });
  // No session in the test environment → the landing experience must render.
  expect(screen.getByRole('button', { name: /get started free/i })).toBeInTheDocument();
  expect(screen.getByText(/Scan · Map · Generate/i)).toBeInTheDocument();
});
