import { GoogleLogin, GoogleOAuthProvider } from "@react-oauth/google";
import { setToken } from "@/lib/auth";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";

interface Props {
  onSuccess: () => void;
}

export function LoginPage({ onSuccess }: Props) {
  return (
    <GoogleOAuthProvider clientId={CLIENT_ID}>
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-8 p-10 rounded-2xl border bg-card shadow-lg w-full max-w-sm">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold tracking-tight">DMA Pulse</h1>
            <p className="text-sm text-muted-foreground">
              Sign in with your Artefact account to continue
            </p>
          </div>

          {CLIENT_ID ? (
            <GoogleLogin
              onSuccess={(res) => {
                if (res.credential) {
                  setToken(res.credential);
                  onSuccess();
                }
              }}
              onError={() => {}}
              hosted_domain="artefact.com"
              text="signin_with"
              shape="rectangular"
              size="large"
              width={280}
            />
          ) : (
            <p className="text-sm text-destructive text-center">
              OAuth client ID not configured.
              <br />
              Set <code>VITE_GOOGLE_CLIENT_ID</code> and redeploy.
            </p>
          )}
        </div>
      </div>
    </GoogleOAuthProvider>
  );
}
