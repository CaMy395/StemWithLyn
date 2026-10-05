import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PortalMessages from './PortalMessages';

beforeEach(() => {
  localStorage.setItem('loggedInUser', JSON.stringify({ id: 2, role: 'client' }));
  localStorage.setItem('portalToken', 'signed-token');
  Element.prototype.scrollIntoView = jest.fn();
});
afterEach(() => { jest.restoreAllMocks(); localStorage.clear(); });

test('client can send a message and sees the reply with signed authentication', async () => {
  let sent = false;
  global.fetch = jest.fn(async (url, options) => {
    expect(options.headers.Authorization).toBe('Bearer signed-token');
    const data = url.endsWith('/conversations') ? [] : options.method === 'POST' ? { id: '1' } : sent ? [{ id: '1', body: 'Can we discuss my session?', from_admin: false, created_at: '2026-10-05T12:00:00Z' }] : [];
    if (options.method === 'POST' && !url.endsWith('/read')) sent = true;
    return { ok: true, json: async () => data };
  });
  render(<MemoryRouter><PortalMessages /></MemoryRouter>);
  await screen.findByText('Start the conversation below.');
  fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Can we discuss my session?' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(screen.getByLabelText('Your message').value).toBe(''));
  await screen.findByText('Can we discuss my session?', { selector: 'p' });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Send message' }).disabled).toBe(true));
});

test('failed sends retain the draft and explain that the message was not sent', async () => {
  global.fetch = jest.fn(async (_url, options) => ({ ok: options.method !== 'POST', json: async () => options.method === 'POST' ? { error: 'Your message was not sent. Please try again.' } : [] }));
  render(<MemoryRouter><PortalMessages /></MemoryRouter>);
  await screen.findByText('Start the conversation below.');
  fireEvent.change(screen.getByLabelText('Your message'), { target: { value: 'Please help' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Your message was not sent'));
  expect(screen.getByLabelText('Your message').value).toBe('Please help');
});
