import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import * as React from "react";
import { RadioGroup, RadioGroupItem } from "./radio-group";

afterEach(cleanup);

describe("RadioGroup", () => {
  it("renders with default accessible role", () => {
    render(
      <RadioGroup defaultValue="opt1">
        <RadioGroupItem value="opt1" id="r1" aria-label="Option 1" />
        <RadioGroupItem value="opt2" id="r2" aria-label="Option 2" />
      </RadioGroup>
    );

    const group = screen.getByRole("radiogroup");
    expect(group).toBeInTheDocument();

    const radio1 = screen.getByLabelText("Option 1");
    const radio2 = screen.getByLabelText("Option 2");

    expect(radio1).toHaveAttribute("aria-checked", "true");
    expect(radio2).toHaveAttribute("aria-checked", "false");
  });

  it("handles selection change on click", () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup defaultValue="opt1" onValueChange={onValueChange}>
        <RadioGroupItem value="opt1" id="r1" aria-label="Option 1" />
        <RadioGroupItem value="opt2" id="r2" aria-label="Option 2" />
      </RadioGroup>
    );

    const radio2 = screen.getByLabelText("Option 2");
    fireEvent.click(radio2);

    expect(onValueChange).toHaveBeenCalledWith("opt2");
    expect(radio2).toHaveAttribute("aria-checked", "true");
  });

  it("prevents selection when disabled", () => {
    const onValueChange = vi.fn();
    render(
      <RadioGroup defaultValue="opt1" onValueChange={onValueChange} disabled>
        <RadioGroupItem value="opt1" id="r1" aria-label="Option 1" />
        <RadioGroupItem value="opt2" id="r2" aria-label="Option 2" />
      </RadioGroup>
    );

    const radio2 = screen.getByLabelText("Option 2");
    fireEvent.click(radio2);

    expect(onValueChange).not.toHaveBeenCalled();
    expect(radio2).toBeDisabled();
  });
});
