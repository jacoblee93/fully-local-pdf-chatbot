import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChatWindow } from '@/components/ChatWindow';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';

// Mock the useSearchParams hook
jest.mock('next/navigation', () => ({
  useSearchParams: () => ({
    get: jest.fn().mockImplementation((param) => {
      if (param === 'provider') {
        return 'webllm';
      }
      return null;
    }),
  }),
}));

describe('ChatWindow Component', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('renders the initial PDF upload interface', () => {
    render(<ChatWindow placeholder="Test placeholder" />);
    
    // Check if the title is rendered
    expect(screen.getByText('Fully In-Browser Chat Over Documents')).toBeInTheDocument();
    
    // Check if the file input is rendered
    expect(screen.getByLabelText(/ollama/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/webllm/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/chrome_ai/i)).toBeInTheDocument();
    
    // Check if the embed button is rendered
    expect(screen.getByRole('button', { name: /embed/i })).toBeInTheDocument();
  });

  it('shows an error toast when trying to embed without selecting a file', async () => {
    render(<ChatWindow placeholder="Test placeholder" />);
    
    // Click the embed button without selecting a file
    const embedButton = screen.getByRole('button', { name: /embed/i });
    fireEvent.click(embedButton);
    
    // Check if the toast.error was called
    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('You must select a file to embed'),
        expect.anything()
      );
    });
  });

  it('changes model provider when radio buttons are clicked', async () => {
    render(<ChatWindow placeholder="Test placeholder" />);
    
    // Initially, WebLLM should be selected (from our mock)
    expect(screen.getByLabelText(/webllm/i)).toBeChecked();
    
    // Click on the Ollama radio button
    const ollamaRadio = screen.getByLabelText(/ollama/i);
    await userEvent.click(ollamaRadio);
    
    // Check if the title changes to reflect the Ollama provider
    await waitFor(() => {
      expect(screen.getByText('Fully Local Chat Over Documents')).toBeInTheDocument();
    });
  });
});