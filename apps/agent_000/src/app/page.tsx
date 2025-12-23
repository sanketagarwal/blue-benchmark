export default function HomePage(): React.ReactElement {
  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: '600px',
        margin: '100px auto',
        padding: '20px',
      }}
    >
      <h1>Agent 000: Word Guessing Game</h1>
      <p>
        This is a minimal Next.js app demonstrating the nullagent framework with a word guessing
        game.
      </p>
      <h2>Usage</h2>
      <ul>
        <li>
          <code>GET /api/play</code> - View current game state
        </li>
        <li>
          <code>POST /api/play</code> - Play one round (agent makes a guess)
        </li>
      </ul>
      <h2>Example with curl</h2>
      <pre
        style={{
          background: '#f5f5f5',
          padding: '10px',
          borderRadius: '4px',
          overflow: 'auto',
        }}
      >
        {`# View current game state
curl http://localhost:3001/api/play

# Play a round
curl -X POST http://localhost:3001/api/play`}
      </pre>
    </div>
  );
}
