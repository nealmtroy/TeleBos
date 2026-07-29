import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { PublicCheckbox } from "./public-checkbox";

describe("PublicCheckbox", () => {
  it("keeps native checkbox semantics and propagates attributes", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <label htmlFor="terms">
        <PublicCheckbox id="terms" name="terms" onChange={onChange} />
        Accept terms
      </label>
    );

    const checkbox = screen.getByRole("checkbox", { name: "Accept terms" });
    expect(checkbox).toHaveAttribute("id", "terms");
    expect(checkbox).toHaveAttribute("name", "terms");
    expect(checkbox).not.toBeChecked();

    await user.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it("supports controlled checked state and keyboard interaction", async () => {
    const user = userEvent.setup();
    render(
      <label htmlFor="remember">
        <PublicCheckbox id="remember" checked readOnly />
        Remember me
      </label>
    );

    const checkbox = screen.getByRole("checkbox", { name: "Remember me" });
    expect(checkbox).toBeChecked();
    checkbox.focus();
    await user.keyboard(" ");
    expect(checkbox).toBeChecked();
  });
});
