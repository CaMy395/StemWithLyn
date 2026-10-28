import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import Clients from './Clients';

test('client info shows appointment statuses and package usage rather than generic package labels', async () => {
  const client = { id: 1, full_name: 'Test Student', email: 'student@example.com', category: 'StemwithLyn' };
  const preview = {
    client,
    packages: [{ key: 'virtual:6', title: 'Virtual Tutoring Package (6 sessions - SCHEDULING)', purchased: 6, remaining: 3, booked: 3, used: 2, completed: 1, noShows: 1, reserved: 1 }],
    appointments: ['completed', 'no_show', 'cancelled', 'confirmed'].map((status, id) => ({ id, status, title: 'Virtual Tutoring Package (6 sessions - SCHEDULING)', date: '2026-10-26', time: '15:00:00', status_note: status === 'cancelled' ? 'Automatically canceled: not confirmed by midnight. No penalty; package session not used.' : '' })),
  };
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async url => ({ ok: true, json: async () => String(url).endsWith('/portal-preview') ? preview : [client] }));
  try {
    render(<Clients />);
    fireEvent.click(await screen.findByRole('button', { name: "View Test Student's portal" }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('3 of 6 left')).toBeTruthy();
    expect(within(dialog).getByText('2 of 6 used (1 completed, 1 no-show) · 1 booked')).toBeTruthy();
    for (const label of ['Completed', 'No-show', 'Canceled', 'Confirmed']) expect(within(dialog).getByText(label)).toBeTruthy();
    expect(within(dialog).getByText('Package session · Used (no-show)')).toBeTruthy();
    expect(within(dialog).getByText('Package session · Credit available')).toBeTruthy();
    expect(within(dialog).getByText(/Automatically canceled: not confirmed by midnight/)).toBeTruthy();
    expect(within(dialog).getByText('Package session · Reserved')).toBeTruthy();
  } finally { global.fetch = originalFetch; }
});
