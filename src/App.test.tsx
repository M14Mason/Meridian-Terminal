import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';
import { DISCLAIMER } from './config';

describe('App', () => {
  it('shows only the pairing screen when unpaired (6.4)', () => {
    localStorage.clear();
    render(<App />);
    expect(screen.getByRole('heading').textContent).toBe('MERIDIAN TERMINAL');
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
    expect(screen.queryByText('KEYS')).toBeNull();
    expect(screen.queryByText('DEVICES')).toBeNull();
  });
});
