import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import axios from 'axios';
import SchedulingPage from './SchedulingPage';

jest.mock('axios', () => ({ get: jest.fn(), post: jest.fn() }));
jest.mock('react-calendar', () => () => null);

test('canceled sessions leave the default schedule but remain available in history filters', async () => {
  const today = new Date();
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const appointments = [
    { id: 1, title: 'Active tutoring', date, time: '15:00', end_time: '16:00', status: 'scheduled' },
    { id: 2, title: 'Unconfirmed canceled tutoring', date, time: '16:00', end_time: '17:00', status: 'cancelled', status_note: 'Automatically canceled: not confirmed by midnight. No penalty; package session not used.' },
  ];
  axios.get.mockImplementation(async url => ({ data: url.endsWith('/appointments') ? appointments : [] }));
  const originalFetch = global.fetch;
  global.fetch = jest.fn(async () => ({ json: async () => [] }));
  try {
    render(<SchedulingPage />);
    await screen.findAllByText('Active tutoring');
    expect(screen.queryByText('Unconfirmed canceled tutoring')).toBeNull();
    expect(screen.getByLabelText('Show status').value).toBe('active');
    fireEvent.change(screen.getByLabelText('Show status'), { target: { value: 'cancelled' } });
    expect(screen.getAllByText('Unconfirmed canceled tutoring').length).toBeGreaterThan(0);
    expect(screen.queryByText('Active tutoring')).toBeNull();
    expect(screen.getByText(/Status note: Automatically canceled/)).toBeTruthy();
  } finally { global.fetch = originalFetch; }
});
