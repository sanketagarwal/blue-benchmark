import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Agent 000 - Word Guessing Game',
  description: 'A minimal LLM agent playing a word guessing game',
};

export default function RootLayout({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
