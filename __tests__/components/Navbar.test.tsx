import React from 'react';
import { render, screen } from '@testing-library/react';
import { Navbar } from '@/components/Navbar';

// Mock the usePathname hook
jest.mock('next/navigation', () => ({
  usePathname: jest.fn().mockImplementation(() => '/'),
}));

describe('Navbar Component', () => {
  it('renders all navigation links', () => {
    render(<Navbar />);
    
    // Check if all navigation links are rendered
    expect(screen.getByText(/🏴‍☠️ Chat/i)).toBeInTheDocument();
    expect(screen.getByText(/🧱 Structured Output/i)).toBeInTheDocument();
    expect(screen.getByText(/🦜 Agents/i)).toBeInTheDocument();
    expect(screen.getByText(/🐶 Retrieval/i)).toBeInTheDocument();
    expect(screen.getByText(/🤖 Retrieval Agents/i)).toBeInTheDocument();
  });

  it('applies active styling to the current path', () => {
    render(<Navbar />);
    
    // The mock returns '/' as the current path, so the Chat link should have the active class
    const chatLink = screen.getByText(/🏴‍☠️ Chat/i);
    expect(chatLink).toHaveClass('text-white');
    expect(chatLink).toHaveClass('border-b');
    
    // Other links should not have the active class
    const structuredOutputLink = screen.getByText(/🧱 Structured Output/i);
    expect(structuredOutputLink).not.toHaveClass('text-white');
    expect(structuredOutputLink).not.toHaveClass('border-b');
  });
});