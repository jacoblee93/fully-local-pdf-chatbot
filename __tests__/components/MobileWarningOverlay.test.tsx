import React from 'react';
import { render, screen } from '@testing-library/react';
import { MobileWarningOverlay } from '@/components/MobileWarningOverlay';

describe('MobileWarningOverlay Component', () => {
  it('renders the mobile warning message', () => {
    render(<MobileWarningOverlay />);
    
    // Check if the warning message is rendered
    expect(screen.getByText(/It looks like you are on a mobile device./i)).toBeInTheDocument();
    expect(screen.getByText(/The local LLMs used for this app are only designed to work on desktop./i)).toBeInTheDocument();
    expect(screen.getByText(/Please come back once you're at a computer!/i)).toBeInTheDocument();
  });
});