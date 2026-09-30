import { render, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AutoReplyEditor } from "./auto-reply-editor";

/**
 * Render the editor as a controlled component. Every lookup is scoped to this
 * render's container, so one test's DOM can never satisfy another's query.
 */
function renderEditor(initial = "") {
  const onChange = vi.fn();
  const { container } = render(
    <AutoReplyEditor value={initial} onChange={onChange} />
  );
  const scope = within(container);
  return {
    onChange,
    container,
    byTitle: (re: RegExp) => scope.getByTitle(re),
    byRole: (name: RegExp | string) => scope.getByRole("button", { name }),
    byLabel: (text: string) => scope.getByLabelText(text),
    byPlaceholder: (text: string) => scope.getByPlaceholderText(text),
    queryByLabel: (text: string) => scope.queryByLabelText(text),
    byText: (re: RegExp | string) => scope.getByText(re),
  };
}

/** Render a fixed message and switch to preview mode. */
function renderPreview(message: string) {
  const { container } = render(
    <AutoReplyEditor value={message} onChange={vi.fn()} />
  );
  fireEvent.click(within(container).getByRole("button", { name: /preview/i }));
  return container;
}

describe("AutoReplyEditor — link insertion", () => {
  it("inserts a link from the inline form instead of a window.prompt", () => {
    const { onChange, byTitle, byRole, byLabel } = renderEditor("");

    fireEvent.click(byTitle(/Tautan/i));
    fireEvent.change(byLabel("Link URL"), {
      target: { value: "https://t.me/telebos_official" },
    });
    fireEvent.click(byRole("Insert Link"));

    expect(onChange).toHaveBeenCalledWith(
      '<a href="https://t.me/telebos_official">https://t.me/telebos_official</a>'
    );
  });

  it("uses the supplied link text when given", () => {
    const { onChange, byTitle, byRole, byLabel } = renderEditor("");

    fireEvent.click(byTitle(/Tautan/i));
    fireEvent.change(byLabel("Link URL"), {
      target: { value: "https://t.me/telebos_official" },
    });
    fireEvent.change(byLabel("Link text"), {
      target: { value: "our channel" },
    });
    fireEvent.click(byRole("Insert Link"));

    expect(onChange).toHaveBeenCalledWith(
      '<a href="https://t.me/telebos_official">our channel</a>'
    );
  });

  it("escapes quotes in a URL so they cannot break out of the attribute", () => {
    const { onChange, byTitle, byRole, byLabel } = renderEditor("");

    fireEvent.click(byTitle(/Tautan/i));
    fireEvent.change(byLabel("Link URL"), {
      target: { value: 'https://x.com/?a="><script>alert(1)</script>' },
    });
    fireEvent.click(byRole("Insert Link"));

    const emitted = onChange.mock.calls[0][0] as string;
    // The quote is encoded inside the href attribute, so the attribute cannot
    // be terminated early. The same characters in the link *text* are inert
    // because the preview escapes text nodes.
    const href = emitted.match(/href="([^"]*)"/)?.[1] ?? "";
    expect(href).toContain("&quot;");
    expect(href).not.toContain('"');
  });

  it("does not insert anything when the URL is blank", () => {
    const { onChange, byTitle, byRole } = renderEditor("");

    fireEvent.click(byTitle(/Tautan/i));
    fireEvent.click(byRole("Insert Link"));

    expect(onChange).not.toHaveBeenCalled();
  });

  it("closes the inline form when cancelled", () => {
    const { byTitle, byRole, byLabel, queryByLabel } = renderEditor("");

    fireEvent.click(byTitle(/Tautan/i));
    expect(byLabel("Link URL")).toBeInTheDocument();

    fireEvent.click(byRole("Cancel"));
    expect(queryByLabel("Link URL")).not.toBeInTheDocument();
  });
});

describe("AutoReplyEditor — preview sanitisation", () => {
  it("renders a safe https link in the preview", () => {
    const container = renderPreview(
      '<a href="https://t.me/telebos_official">@telebos_official</a>'
    );

    const anchor = container.querySelector("a");
    expect(anchor?.getAttribute("href")).toBe("https://t.me/telebos_official");
    expect(anchor?.getAttribute("rel")).toContain("noreferrer");
  });

  // The preview renders through dangerouslySetInnerHTML, so an executable
  // scheme surviving here would be script injection.
  it("neutralises a javascript: URL in the preview", () => {
    const container = renderPreview('<a href="javascript:alert(1)">click</a>');
    expect(container.querySelector("a")?.getAttribute("href")).toBe("#");
  });

  it.each([
    ["data", '<a href="data:text/html;base64,PHN2Zz4=">x</a>'],
    ["vbscript", '<a href="vbscript:msgbox(1)">x</a>'],
  ])("neutralises a %s: URL in the preview", (_scheme, message) => {
    const container = renderPreview(message);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("#");
  });

  it("allows the tg: scheme used by Telegram deep links", () => {
    const container = renderPreview(
      '<a href="tg://resolve?domain=telebos_official">x</a>'
    );
    expect(container.querySelector("a")?.getAttribute("href")).toBe(
      "tg://resolve?domain=telebos_official"
    );
  });

  it("escapes an unknown HTML tag instead of rendering it", () => {
    const container = renderPreview("<img src=x onerror=alert(1)>");
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders bold as strong in the preview", () => {
    const container = renderPreview("<b>hello</b>");
    expect(container.querySelector("strong")?.textContent).toBe("hello");
  });
});

describe("AutoReplyEditor — emoji picker", () => {
  it("opens and closes the emoji picker", () => {
    const { byTitle, byRole, byPlaceholder, queryByLabel } = renderEditor("");

    fireEvent.click(byTitle(/Pilih Emoji/i));
    expect(byPlaceholder("Cari emoji...")).toBeInTheDocument();

    fireEvent.click(byRole("Close emoji picker"));
    expect(queryByLabel("Close emoji picker")).not.toBeInTheDocument();
  });

  it("reports when a search matches no emoji", () => {
    const { byTitle, byPlaceholder, byText } = renderEditor("");

    fireEvent.click(byTitle(/Pilih Emoji/i));
    fireEvent.change(byPlaceholder("Cari emoji..."), {
      target: { value: "zzzznotanemoji" },
    });

    expect(byText(/Emoji tidak ditemukan/i)).toBeInTheDocument();
  });
});

describe("AutoReplyEditor — character limit", () => {
  it("flags text over the Telegram 4096-character limit", () => {
    const { byText } = renderEditor("a".repeat(4100));
    expect(byText("4100/4096")).toBeInTheDocument();
  });

  it("shows the count within the limit", () => {
    const { byText } = renderEditor("hello");
    expect(byText("5/4096")).toBeInTheDocument();
  });
});