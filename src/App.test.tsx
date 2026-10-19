import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from './App';
import { DISCLAIMER } from './config';

describe('App', () => {
  it('renders the name and the required disclaimer (22.5)', () => {
    render(<App />);
    expect(screen.getByRole('heading').textContent).toBe('MERIDIAN TERMINAL');
    expect(screen.getByText(DISCLAIMER)).toBeTruthy();
  });
});
