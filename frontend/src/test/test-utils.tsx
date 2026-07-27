import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { PropsWithChildren, ReactElement } from "react";

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

export function createQueryClientWrapper(queryClient = createTestQueryClient()) {
  function QueryClientWrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { queryClient, wrapper: QueryClientWrapper };
}

export function renderWithQueryClient(ui: ReactElement, options?: RenderOptions) {
  const { queryClient, wrapper } = createQueryClientWrapper();

  return {
    queryClient,
    ...render(ui, { wrapper, ...options }),
  };
}
