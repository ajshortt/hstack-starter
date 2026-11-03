import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders the home route and counts clicks", () => {
    render(
      <MemoryRouter initialEntries={["/"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );
    const button = screen.getByRole("button", { name: /count is 0/i });
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: /count is 1/i })).toBeInTheDocument();
  });

  it("renders the about route", () => {
    render(
      <MemoryRouter initialEntries={["/about"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /about/i })).toBeInTheDocument();
  });
});
