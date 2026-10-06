import { render, fireEvent, screen, cleanup } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import { TextEditor, TextEditorModal } from "./text-editor";

afterEach(() => {
  cleanup();
});

describe("TextEditor Component", () => {
  it("renders with custom placeholder and accepts text input", () => {
    const onChange = vi.fn();
    render(
      <TextEditor value="Halo dunia" onChange={onChange} placeholder="Tulis pesan..." />
    );

    const textarea = screen.getByPlaceholderText("Tulis pesan...");
    expect(textarea).toHaveValue("Halo dunia");

    fireEvent.change(textarea, { target: { value: "Halo dunia baru" } });
    expect(onChange).toHaveBeenCalledWith("Halo dunia baru");
  });

  it("applies formatting tags on button click", () => {
    const onChange = vi.fn();
    render(
      <TextEditor value="" onChange={onChange} />
    );

    const boldBtn = screen.getByTitle(/Tebal/i);
    fireEvent.click(boldBtn);
    expect(onChange).toHaveBeenCalledWith("<b>tebal</b>");
  });

  it("switches to preview tab and displays rendered HTML", () => {
    render(
      <TextEditor value="<b>Pesan Penting</b>" onChange={vi.fn()} />
    );

    const previewBtn = screen.getByRole("button", { name: /preview/i });
    fireEvent.click(previewBtn);

    expect(screen.getByText("Pesan Penting")).toBeInTheDocument();
  });
});

describe("TextEditorModal Component", () => {
  it("renders modal when open is true", () => {
    render(
      <TextEditorModal
        open={true}
        onOpenChange={vi.fn()}
        title="Edit Auto Reply"
        description="Deskripsi modal"
        value="Pesan awal"
        onSave={vi.fn()}
      />
    );

    expect(screen.getByText("Edit Auto Reply")).toBeInTheDocument();
    expect(screen.getByText("Deskripsi modal")).toBeInTheDocument();
  });

  it("calls onSave with updated draft text upon clicking Simpan", async () => {
    const onSave = vi.fn();
    const onOpenChange = vi.fn();

    render(
      <TextEditorModal
        open={true}
        onOpenChange={onOpenChange}
        title="Edit Auto Reply"
        value="Pesan awal"
        placeholder="Ketik teks pesan..."
        onSave={onSave}
      />
    );

    const textarea = screen.getByPlaceholderText("Ketik teks pesan...");
    fireEvent.change(textarea, { target: { value: "Pesan yang diedit" } });

    const saveBtn = screen.getByRole("button", { name: "Simpan" });
    fireEvent.click(saveBtn);

    expect(onSave).toHaveBeenCalledWith("Pesan yang diedit");
  });

  it("calls onOpenChange(false) when clicking Batal", () => {
    const onOpenChange = vi.fn();

    render(
      <TextEditorModal
        open={true}
        onOpenChange={onOpenChange}
        title="Edit Auto Reply"
        value="Pesan awal"
        onSave={vi.fn()}
      />
    );

    const cancelBtn = screen.getByRole("button", { name: "Batal" });
    fireEvent.click(cancelBtn);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
