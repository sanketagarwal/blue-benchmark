/**
 * Shared test setup for agent-core
 * Configures vitest-mock-extended to throw on unmocked method calls
 */
import { mockDeep, mockReset } from 'vitest-mock-extended';

export { mockDeep, mockReset };

/**
 * Create a strict mock that throws on unmocked method calls
 * Use this instead of vi.fn() for type-safe mocking
 */
export function strictMock<T>(): T {
  return mockDeep<T>({
    fallbackMockImplementation: () => {
      throw new Error(
        'Unmocked method called. Add explicit mock implementation or use mockDeep.'
      );
    },
  });
}
