import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LiveVisitors from './LiveVisitors';

afterEach(() => { delete global.fetch; localStorage.clear(); });
test('shows verified names, anonymous visitors and the departed visitor from an alert', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ updatedAt: '2026-10-07T15:00:00Z', visitors: [
    { id: 'client', name: 'Example Client', page: '/client-portal', active: true, arrived_at: '2026-10-07T14:55:00Z', seen_at: '2026-10-07T15:00:00Z' },
    { id: 'anonymous-123', name: null, page: '/', active: true, arrived_at: '2026-10-07T14:55:00Z', seen_at: '2026-10-07T15:00:00Z' },
    { id: 'departed', name: null, page: '/tutoring-intake', active: false, arrived_at: '2026-10-07T14:45:00Z', seen_at: '2026-10-07T14:50:00Z' },
  ] }) });
  render(<MemoryRouter initialEntries={['/admin/visitors?visitor=departed']}><LiveVisitors /></MemoryRouter>);
  expect(await screen.findByText('Example Client')).toBeInTheDocument();
  expect(screen.getByText('2 active visitors')).toBeInTheDocument();
  expect(screen.getByText('Anonymous visitor · anonymou')).toBeInTheDocument();
  expect(screen.getByText('Visitor from your notification')).toBeInTheDocument();
  expect(screen.getByText('No longer active')).toBeInTheDocument();
});
test('requires admin sign-in when the visitor API rejects the token', async () => {
  global.fetch = jest.fn().mockResolvedValue({ status: 401 });
  render(<MemoryRouter initialEntries={['/admin/visitors']}><LiveVisitors /></MemoryRouter>);
  expect(await screen.findByText('Sign in')).toHaveAttribute('href', '/login');
  expect(screen.queryByText('0 active visitors')).not.toBeInTheDocument();
});
