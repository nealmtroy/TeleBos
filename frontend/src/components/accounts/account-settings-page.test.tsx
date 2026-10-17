import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";
import AccountSettingsPage from "./account-settings-page";
import { renderWithQueryClient } from "@/test/test-utils";
import { useI18nStore } from "@/lib/i18n";

const mockToast = vi.fn();
vi.mock("@/components/ui/toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "dc7b4891-179b-4595-b95b-675b0b6d5d77" }),
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/store/auth-store", () => ({
  useAuthStore: (selector: any) =>
    selector({
      user: { id: "user-1", email: "admin@telebos.site" },
    }),
}));

const mockApi = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  default: mockApi,
}));

describe("AccountSettingsPage - Profile & Photo UX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useI18nStore.setState({ locale: "id", preference: "id" });
  });

  afterEach(() => {
    cleanup();
    document.body.style.pointerEvents = "";
    document.body.removeAttribute("data-scroll-locked");
  });

  const baseAccount = {
    id: "dc7b4891-179b-4595-b95b-675b0b6d5d77",
    first_name: "Yudha",
    last_name: "Prihardana",
    username: "yudhapri",
    bio: "Product Engineer",
    phone: "+6281234567890",
    has_profile_photo: false,
    photo_version: 0,
    is_active: true,
  };

  it("shows Upload button and hides Delete button when account has no profile photo", async () => {
    mockApi.get.mockImplementation(async (url: string) => {
      if (url === "/accounts/dc7b4891-179b-4595-b95b-675b0b6d5d77") {
        return { data: baseAccount };
      }
      return { data: {} };
    });

    renderWithQueryClient(<AccountSettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Foto Profil")).toBeInTheDocument();
    });

    // Should show Upload Photo ("Unggah Foto")
    expect(screen.getByRole("button", { name: /Unggah Foto/i })).toBeInTheDocument();
    // Should NOT show Delete Photo ("Hapus Foto") button
    expect(screen.queryByRole("button", { name: /Hapus Foto/i })).not.toBeInTheDocument();
  });

  it("shows Change and Delete buttons when account has profile photo", async () => {
    mockApi.get.mockImplementation(async (url: string) => {
      if (url === "/accounts/dc7b4891-179b-4595-b95b-675b0b6d5d77") {
        return {
          data: {
            ...baseAccount,
            has_profile_photo: true,
            photo_version: 1,
          },
        };
      }
      return { data: {} };
    });

    const user = userEvent.setup();
    renderWithQueryClient(<AccountSettingsPage />);

    const deleteBtn = await screen.findByRole("button", { name: /Hapus Foto/i });
    expect(deleteBtn).toBeInTheDocument();

    // Clicking delete opens confirm dialog
    await user.click(deleteBtn);

    const dialogPrompt = await screen.findByText("Hapus foto profil?");
    expect(dialogPrompt).toBeInTheDocument();

    mockApi.delete.mockResolvedValueOnce({ data: { success: true } });

    // Confirm delete in dialog (outer page is aria-hidden by Radix Dialog)
    const confirmBtn = screen.getByRole("button", { name: "Hapus Foto" });
    await user.click(confirmBtn);

    await waitFor(() => {
      expect(mockApi.delete).toHaveBeenCalledWith("/accounts/dc7b4891-179b-4595-b95b-675b0b6d5d77/photo");
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "success",
          title: "Foto profil berhasil dihapus!",
        })
      );
    });
  });

  it("renders profile details in read-only view with Edit Profile button", async () => {
    mockApi.get.mockImplementation(async (url: string) => {
      if (url === "/accounts/dc7b4891-179b-4595-b95b-675b0b6d5d77") {
        return { data: baseAccount };
      }
      return { data: {} };
    });

    renderWithQueryClient(<AccountSettingsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Edit Profil/i })).toBeInTheDocument();
      expect(screen.getByText("Yudha")).toBeInTheDocument();
      expect(screen.getByText("Prihardana")).toBeInTheDocument();
      expect(screen.getByText("@yudhapri")).toBeInTheDocument();
      expect(screen.getByText("Product Engineer")).toBeInTheDocument();
    });

    // Inputs should NOT be present in read-only mode
    expect(screen.queryByLabelText(/Nama Depan/i)).not.toBeInTheDocument();
  });

  it("enters edit mode when Edit Profile is clicked, and cancels cleanly", async () => {
    mockApi.get.mockImplementation(async (url: string) => {
      if (url === "/accounts/dc7b4891-179b-4595-b95b-675b0b6d5d77") {
        return { data: baseAccount };
      }
      return { data: {} };
    });

    const user = userEvent.setup();
    renderWithQueryClient(<AccountSettingsPage />);

    const editBtn = await screen.findByRole("button", { name: /Edit Profil/i });
    await user.click(editBtn);

    // Inputs are now displayed
    const firstNameInput = screen.getByLabelText(/Nama Depan/i);
    expect(firstNameInput).toBeInTheDocument();
    expect(firstNameInput).toHaveValue("Yudha");

    // Edit input
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Budi");
    expect(firstNameInput).toHaveValue("Budi");

    // Click Batal
    const cancelBtn = screen.getAllByRole("button", { name: /Batal/i })[0];
    await user.click(cancelBtn);

    // Exits edit mode and value returns to original
    expect(screen.queryByLabelText(/Nama Depan/i)).not.toBeInTheDocument();
    expect(screen.getByText("Yudha")).toBeInTheDocument();
    expect(screen.queryByText("Budi")).not.toBeInTheDocument();
  });

  it("saves profile changes and triggers success toast", async () => {
    mockApi.get.mockImplementation(async (url: string) => {
      if (url === "/accounts/dc7b4891-179b-4595-b95b-675b0b6d5d77") {
        return { data: baseAccount };
      }
      return { data: {} };
    });

    mockApi.put.mockResolvedValueOnce({ data: { success: true } });

    const user = userEvent.setup();
    renderWithQueryClient(<AccountSettingsPage />);

    const editBtn = await screen.findByRole("button", { name: /Edit Profil/i });
    await user.click(editBtn);

    const firstNameInput = screen.getByLabelText(/Nama Depan/i);
    await user.clear(firstNameInput);
    await user.type(firstNameInput, "Alexander");

    const usernameInput = screen.getByLabelText(/Nama Pengguna/i);
    await user.clear(usernameInput);
    await user.type(usernameInput, "@alexander");

    const bioInput = screen.getByLabelText(/Bio/i);
    await user.clear(bioInput);
    await user.type(bioInput, "Tech Lead");

    const saveBtn = screen.getAllByRole("button", { name: /Simpan/i })[0];
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockApi.put).toHaveBeenCalledWith(
        "/accounts/dc7b4891-179b-4595-b95b-675b0b6d5d77/profile",
        {
          first_name: "Alexander",
          last_name: "Prihardana",
          username: "alexander", // leading @ stripped
          bio: "Tech Lead",
        }
      );
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "success",
          title: "Profil berhasil diperbarui!",
        })
      );
    });
  });

  it("shows error toast when saving with empty first name", async () => {
    mockApi.get.mockImplementation(async (url: string) => {
      if (url === "/accounts/dc7b4891-179b-4595-b95b-675b0b6d5d77") {
        return { data: baseAccount };
      }
      return { data: {} };
    });

    const user = userEvent.setup();
    renderWithQueryClient(<AccountSettingsPage />);

    const editBtn = await screen.findByRole("button", { name: /Edit Profil/i });
    await user.click(editBtn);

    const firstNameInput = screen.getByLabelText(/Nama Depan/i);
    await user.clear(firstNameInput);

    const saveBtn = screen.getAllByRole("button", { name: /Simpan/i })[0];
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "error",
          title: "Gagal memperbarui profil",
          description: "Nama depan tidak boleh kosong.",
        })
      );
    });
  });

  it("shows live warning when username is too short (< 5 chars)", async () => {
    mockApi.get.mockImplementation(async (url: string) => {
      if (url === "/accounts/dc7b4891-179b-4595-b95b-675b0b6d5d77") {
        return { data: baseAccount };
      }
      return { data: {} };
    });

    const user = userEvent.setup();
    renderWithQueryClient(<AccountSettingsPage />);

    const editBtn = await screen.findByRole("button", { name: /Edit Profil/i });
    await user.click(editBtn);

    const usernameInput = screen.getByLabelText(/Nama Pengguna/i);
    await user.clear(usernameInput);
    await user.type(usernameInput, "abc");

    expect(await screen.findByText("Username minimal 5 karakter")).toBeInTheDocument();
  });

  it("shows live indicator and disables save when username is already taken", async () => {
    mockApi.get.mockImplementation(async (url: string) => {
      if (url === "/accounts/dc7b4891-179b-4595-b95b-675b0b6d5d77") {
        return { data: baseAccount };
      }
      if (url === "/accounts/dc7b4891-179b-4595-b95b-675b0b6d5d77/check-username") {
        return {
          data: {
            available: false,
            reason: "occupied",
            message: "Username sudah digunakan oleh akun lain",
          },
        };
      }
      return { data: {} };
    });

    const user = userEvent.setup();
    renderWithQueryClient(<AccountSettingsPage />);

    const editBtn = await screen.findByRole("button", { name: /Edit Profil/i });
    await user.click(editBtn);

    const usernameInput = screen.getByLabelText(/Nama Pengguna/i);
    await user.clear(usernameInput);
    await user.type(usernameInput, "alreadytaken");

    // Live indicator should show occupied error
    expect(await screen.findByText("Username sudah digunakan oleh akun lain")).toBeInTheDocument();

    // Save buttons should be disabled
    const saveButtons = screen.getAllByRole("button", { name: /Simpan/i });
    expect(saveButtons[0]).toBeDisabled();
  });

  it("shows live available indicator when username is valid and available", async () => {
    mockApi.get.mockImplementation(async (url: string) => {
      if (url === "/accounts/dc7b4891-179b-4595-b95b-675b0b6d5d77") {
        return { data: baseAccount };
      }
      if (url === "/accounts/dc7b4891-179b-4595-b95b-675b0b6d5d77/check-username") {
        return {
          data: {
            available: true,
            reason: "available",
            message: "Username tersedia",
          },
        };
      }
      return { data: {} };
    });

    const user = userEvent.setup();
    renderWithQueryClient(<AccountSettingsPage />);

    const editBtn = await screen.findByRole("button", { name: /Edit Profil/i });
    await user.click(editBtn);

    const usernameInput = screen.getByLabelText(/Nama Pengguna/i);
    await user.clear(usernameInput);
    await user.type(usernameInput, "brandnewhandle");

    expect(await screen.findByText("Username tersedia")).toBeInTheDocument();

    const saveButtons = screen.getAllByRole("button", { name: /Simpan/i });
    expect(saveButtons[0]).not.toBeDisabled();
  });
});
