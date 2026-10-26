import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ClientPortalPage from './ClientPortalPage';

jest.mock('./PortalMessages', () => ({ MessageLink: () => null }));

test('past sessions are not automatically completed and canceled future sessions appear in history', async () => {
  localStorage.setItem('loggedInUser', JSON.stringify({ id: 1, role: 'client', username: 'student' }));
  const date = offset => { const value = new Date(); value.setDate(value.getDate() + offset); return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; };
  const appointments = [
    { id: 1, title: 'Unreviewed session', date: date(-2), time: '15:00' },
    { id: 2, title: 'Canceled future session', date: date(2), time: '15:00', status: 'cancelled' },
    { id: 3, title: 'Finished session', date: date(-1), time: '15:00', status: 'completed' },
    { id: 4, title: 'Next session', date: date(1), time: '15:00', status: 'confirmed' },
    { id: 5, title: 'Late cancellation', date: date(-1), time: '17:00', status: 'no_show' },
  ];
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async url => ({ ok: true, json: async () => String(url).endsWith('/client/me') ? { client: { full_name: 'Student' } } : String(url).endsWith('/client/appointments') ? appointments : [] }));
  try {
    const { container } = render(<MemoryRouter><ClientPortalPage /></MemoryRouter>);
    await screen.findByRole('heading', { name: 'Unreviewed session' });
    const unreviewed = screen.getByRole('heading', { name: 'Unreviewed session' }).closest('.appointment-card-portal');
    expect(within(unreviewed).getByText('Scheduled')).toBeTruthy();
    expect(within(unreviewed).queryByText('Completed')).toBeNull();
    const canceled = screen.getByRole('heading', { name: 'Canceled future session' }).closest('.appointment-card-portal');
    expect(canceled.classList.contains('past')).toBe(true);
    expect(within(canceled).getByText('Canceled')).toBeTruthy();
    expect(within(canceled).queryByRole('button', { name: /cancel/i })).toBeNull();
    const noShow = screen.getByRole('heading', { name: 'Late cancellation' }).closest('.appointment-card-portal');
    expect(within(noShow).getByText('No-show')).toBeTruthy();
    expect(within(noShow).getByText('Counts as a used session')).toBeTruthy();
    const stats = container.querySelectorAll('.portal-stats article');
    expect(stats[0].querySelector('strong').textContent).toBe('1');
    expect(stats[1].querySelector('strong').textContent).toBe('1');
  } finally { global.fetch = originalFetch; localStorage.clear(); }
});
