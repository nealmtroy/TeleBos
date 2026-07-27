import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FolderFilterBar } from "./folder-filter-bar";

const folders = [
  { id: "folder-1", name: "Work", created_at: "", updated_at: "" },
  { id: "folder-2", name: "Personal", created_at: "", updated_at: "" },
];

describe("FolderFilterBar", () => {
  it("renders nothing without folders", () => {
    const { container } = render(
      <FolderFilterBar folders={[]} selectedFolderId={null} onSelect={vi.fn()} />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("calls onSelect for all accounts and individual folders", () => {
    const onSelect = vi.fn();
    render(<FolderFilterBar folders={folders} selectedFolderId="folder-1" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: /all accounts/i }));
    fireEvent.click(screen.getByRole("button", { name: "Personal" }));

    expect(onSelect).toHaveBeenNthCalledWith(1, null);
    expect(onSelect).toHaveBeenNthCalledWith(2, "folder-2");
  });
});
