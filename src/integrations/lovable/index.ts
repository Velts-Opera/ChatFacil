import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
};

export const lovable = {
  auth: {
    signInWithOAuth: async (provider: "google" | "apple" | "microsoft", opts?: SignInOptions) => {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: provider as "google",
        options: { redirectTo: opts?.redirect_uri },
      });
      if (error) return { error };
      return { redirected: !!data.url, error: null };
    },
  },
};
