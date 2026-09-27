import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { authSecret, isAllowedEmail } from "@/lib/auth/access";
import { verifyMagicToken } from "@/lib/auth/magic-link";
import { googleClientId, googleClientSecret } from "@/lib/auth/send-email";

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const googleId = googleClientId();
  const googleSecret = googleClientSecret();
  const providers: Provider[] = [
    Credentials({
      id: "magic",
      name: "Email",
      credentials: { token: { label: "Token", type: "text" } },
      authorize: async (credentials) => {
        const token = credentials?.token;
        if (typeof token !== "string" || !token) return null;
        const email = await verifyMagicToken(token);
        if (!email || !isAllowedEmail(email)) return null;
        return { id: email, email, name: email };
      },
    }),
  ];
  if (googleId && googleSecret) {
    providers.push(Google({ clientId: googleId, clientSecret: googleSecret }));
  }

  return {
    trustHost: true,
    secret: authSecret() ?? undefined,
    session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
    pages: { signIn: "/signin", error: "/signin" },
    providers,
    callbacks: {
      async signIn({ user, profile }) {
        const profileEmail = profile && "email" in profile && typeof profile.email === "string" ? profile.email : null;
        return isAllowedEmail(user.email ?? profileEmail);
      },
      async jwt({ token, user }) {
        if (user?.email) token.email = user.email.trim().toLowerCase();
        if (typeof token.email === "string" && !isAllowedEmail(token.email)) return {};
        return token;
      },
      async session({ session, token }) {
        if (session.user) {
          session.user.email = typeof token.email === "string" && isAllowedEmail(token.email) ? token.email : "";
        }
        return session;
      },
    },
  };
});
