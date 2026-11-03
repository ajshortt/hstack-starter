import { useState } from "react";
import { Link, Route, Routes } from "react-router-dom";

function Home() {
  const [count, setCount] = useState(0);
  return (
    <main>
      <h1>react-counter</h1>
      <p>
        <button
          type="button"
          onClick={() => {
            setCount((c) => c + 1);
          }}
        >
          count is {count}
        </button>
      </p>
      <nav>
        <Link to="/about">About</Link>
      </nav>
    </main>
  );
}

function About() {
  return (
    <main>
      <h1>About</h1>
      <p>The hstack-kit react adapter&apos;s reference example: a Vite dev server, a counter, and a second route to prove the verification smoke drives more than the home page.</p>
      <nav>
        <Link to="/">Home</Link>
      </nav>
    </main>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/about" element={<About />} />
    </Routes>
  );
}
