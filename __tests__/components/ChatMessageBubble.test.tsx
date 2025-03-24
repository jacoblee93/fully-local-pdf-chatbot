import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatMessageBubble } from '@/components/ChatMessageBubble';
import { ChatWindowMessage } from '@/schema/ChatWindowMessage';

describe('ChatMessageBubble Component', () => {
  const userMessage: ChatWindowMessage = {
    role: 'user',
    content: 'Hello, this is a test message',
  };

  const assistantMessage: ChatWindowMessage = {
    role: 'assistant',
    content: 'Hello, I am the assistant responding to your test message',
  };

  it('renders user message correctly', () => {
    render(<ChatMessageBubble message={userMessage} aiEmoji={<span>🤖</span>} />);
    
    // Check if the message content is rendered
    expect(screen.getByText('Hello, this is a test message')).toBeInTheDocument();
    
    // Check if the user label is rendered
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('renders assistant message correctly', () => {
    render(<ChatMessageBubble message={assistantMessage} aiEmoji={<span>🤖</span>} />);
    
    // Check if the message content is rendered
    expect(screen.getByText('Hello, I am the assistant responding to your test message')).toBeInTheDocument();
    
    // Check if the AI emoji is rendered
    expect(screen.getByText('🤖')).toBeInTheDocument();
  });

  it('calls onRemovePressed when remove button is clicked', () => {
    const mockOnRemovePressed = jest.fn();
    
    render(
      <ChatMessageBubble 
        message={userMessage} 
        aiEmoji={<span>🤖</span>} 
        onRemovePressed={mockOnRemovePressed} 
      />
    );
    
    // Find and click the remove button
    const removeButton = screen.getByRole('button');
    fireEvent.click(removeButton);
    
    // Check if the onRemovePressed callback was called
    expect(mockOnRemovePressed).toHaveBeenCalledTimes(1);
  });
});