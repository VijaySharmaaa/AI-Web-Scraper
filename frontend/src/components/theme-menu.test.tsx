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
    await user.click(screen.getByRole("button", { name: "Zinc" }));
    expect(document.documentElement.getAttribute("data-color")).toBe("zinc");
    expect(localStorage.getItem("theme-color")).toBe("zinc");

    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Reset theme" }));
    expect(document.documentElement.hasAttribute("data-color")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("system");
  });

  it("ignores junk or removed colors in storage", () => {
    for (const saved of ["<script>", "violet", "blue"]) {
      localStorage.setItem("theme-color", saved);
      const { unmount } = renderMenu();
      expect(document.documentElement.hasAttribute("data-color")).toBe(false);
      unmount();
    }
  });

  it("only offers the neutral base colors", async () => {
    const user = userEvent.setup();
    renderMenu();
    await user.click(screen.getByRole("button", { name: "Theme settings" }));
    const colors = screen.getByRole("group", { name: "Color" });
    expect(colors.querySelectorAll("button")).toHaveLength(5);
    expect(screen.queryByRole("button", { name: /violet|blue|green|orange|rose|red|yellow/i })).not.toBeInTheDocument();
  });
});
