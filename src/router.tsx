import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const PRELOAD_RECOVERY_KEY = "chatfacil:last-preload-recovery";

function installPreloadRecovery() {
  if (typeof window === "undefined") return;

  window.addEventListener("vite:preloadError", (event) => {
    // A browser that stayed open across a Vercel deploy can still reference
    // hashed chunks from the previous deployment. Vite emits this event when
    // the old chunk no longer exists. Reload once so the browser receives the
    // current HTML/chunk manifest instead of leaving the customer on a broken UI.
    event.preventDefault();

    const now = Date.now();
    const lastRecovery = Number(window.sessionStorage.getItem(PRELOAD_RECOVERY_KEY) || "0");
    if (now - lastRecovery < 30_000) return;

    window.sessionStorage.setItem(PRELOAD_RECOVERY_KEY, String(now));
    window.location.reload();
  });
}

installPreloadRecovery();

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
