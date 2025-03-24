import React from 'react';
import { render, screen } from '@testing-library/react';
import Home from '@/app/page';

// Mock the ChatWindow component
jest.mock('@/components/ChatWindow', () => ({
  ChatWindow: ({ placeholder }: { placeholder: string }) => (
    <div data-testid="chat-window">
      <span>Mocked ChatWindow with placeholder: {placeholder}</span>
    </div>
  ),
}));

describe('Home Page', () => {
  it('renders the ChatWindow component with the correct placeholder', () => {
    render(<Home />);
    
    // Check if the ChatWindow component is rendered
    const chatWindow = screen.getByTestId('chat-window');
    expect(chatWindow).toBeInTheDocument();
    
    // Check if the placeholder is passed correctly
    expect(screen.getByText(/Mocked ChatWindow with placeholder: Try asking something about the document you just uploaded!/i)).toBeInTheDocument();
  });
});