// Learn more: https://github.com/testing-library/jest-dom
import '@testing-library/jest-dom';

// Mock the Worker constructor
class MockWorker {
  constructor(stringUrl) {
    this.url = stringUrl;
    this.onmessage = () => {};
  }

  postMessage(msg) {
    // Mock implementation
  }

  addEventListener(event, callback) {
    // Mock implementation
  }

  removeEventListener(event, callback) {
    // Mock implementation
  }
}

// Mock the URL.createObjectURL
URL.createObjectURL = jest.fn();

// Mock the window.Worker
window.Worker = MockWorker;

// Mock toastify
jest.mock('react-toastify', () => {
  const actual = jest.requireActual('react-toastify');
  return {
    ...actual,
    toast: {
      ...actual.toast,
      success: jest.fn(),
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      update: jest.fn(),
    },
  };
});