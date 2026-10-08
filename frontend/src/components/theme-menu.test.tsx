import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ThemeMenu } from "./theme-menu";
import { ThemeProvider } from "@/hooks/use-theme";

function renderMenu() {
  return render(
    <ThemeProvider>
      <ThemeMenu />
    </ThemeProvider>
  );
}

describe("ThemeMenu", () => {
  it("defaults to neutral with no data-color", () => {
    renderMenu();
    expect(document.documentElement.hasAttribute("data-color")).toBe(false);
  });

  it("switches color and mode and remembers them", async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole("button", { name: "Theme settings" }));
    await user.click(screen.getByRole("button", { name: "Blue" }));
    expect(document.documentElement.getAttribute("data-color")).toBe("blue");
    expect(localStorage.getItem("theme-color")).toBe("blue");

    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Reset theme" }));
    expect(document.documentElement.hasAttribute("data-color")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("system");
  });

  it("ignores junk or removed colors in storage", () => {
    for (const saved of ["<script>", "violet"]) {
      localStorage.setItem("theme-color", saved);
      const { unmount } = renderMenu();
      expect(document.documentElement.hasAttribute("data-color")).toBe(false);
      unmount();
    }
  });

  it("has no purple options", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Theme settings" }));
    expect(screen.queryByRole("button", { name: /violet|purple|indigo/i })).not.toBeInTheDocument();
  });
});
