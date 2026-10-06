import { useSocket } from "../src/hooks/useSockets";

function App() {
  const { connected } = useSocket();

  return (
    <main>
      <h1>BSE Trades Dashboard</h1>

      <p>
        Socket.IO:{" "}
        <strong>{connected ? "Connected" : "Disconnected"}</strong>
      </p>
    </main>
  );
}

export default App;