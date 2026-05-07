import { beforeEach, test, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../App';
import { act } from 'react-dom/test-utils';
import { useAppStore } from '../store/useAppStore';

beforeEach(() => {
  // Reset minimal store state used by App
  useAppStore.setState({ activeTab: 'editor', notifications: [] });
});

test('renders app shell and shows loading fallback', async () => {
  await act(async () => {
    render(<App />);
  });
  expect(screen.getByText(/Loading page.../i)).toBeInTheDocument();
});
