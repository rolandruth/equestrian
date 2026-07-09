import { useState } from "react";
import { useLocation } from "wouter";
import { useBusinessLogin, useBusinessSignup, useGetCurrentAuthUser, useBizForgotPassword } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Building2, ArrowLeft, Copy, CheckCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const signupSchema = z.object({
  firstName: z.string().min(1, "Required"),
  lastName: z.string().optional(),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Must be at least 8 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;
type SignupFormValues = z.infer<typeof signupSchema>;

function getReturnTo(): string {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("returnTo");
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/business/dashboard";
  return value;
}

const forgotSchema = z.object({
  email: z.string().email("Invalid email address"),
});
type ForgotFormValues = z.infer<typeof forgotSchema>;

function ForgotPasswordView({ onBack }: { onBack: () => void }) {
  const { toast } = useToast();
  const forgotMutation = useBizForgotPassword();
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const form = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (data: ForgotFormValues) => {
    try {
      const result = await forgotMutation.mutateAsync({ data });
      const link = `${window.location.origin}/business/reset-password?token=${result.resetToken}`;
      setResetLink(link);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error?.message || "Could not generate reset link.",
        variant: "destructive",
      });
    }
  };

  const handleCopy = () => {
    if (!resetLink) return;
    navigator.clipboard.writeText(resetLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (resetLink) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Your password reset link is ready. Click it now to set a new password, or copy it to share.
        </p>
        <a
          href={resetLink}
          className="block w-full rounded-lg border bg-muted/50 px-3 py-2 text-xs font-mono break-all text-primary hover:underline"
        >
          {resetLink}
        </a>
        <div className="flex gap-2">
          <Button asChild className="flex-1">
            <a href={resetLink}>Reset Password</a>
          </Button>
          <Button type="button" variant="outline" onClick={handleCopy} className="gap-1.5">
            {copied ? <CheckCheck className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mt-2">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to login
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Enter your account email and we'll generate a reset link for you.
      </p>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input placeholder="you@example.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" className="w-full" disabled={forgotMutation.isPending}>
            {forgotMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Generate Reset Link
          </Button>
        </form>
      </Form>
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to login
      </button>
    </div>
  );
}

function LoginForm({ onSuccess, onForgot }: { onSuccess: () => Promise<void>; onForgot: () => void }) {
  const { toast } = useToast();
  const loginMutation = useBusinessLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const onSubmit = async (data: LoginFormValues) => {
    try {
      await loginMutation.mutateAsync({ data });
      toast({ title: "Welcome back", description: "You have successfully logged in." });
      await onSuccess();
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error?.message || "Invalid email or password.",
        variant: "destructive",
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="you@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <div className="flex items-center justify-between">
                <FormLabel>Password</FormLabel>
                <button
                  type="button"
                  onClick={onForgot}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Forgot password?
                </button>
              </div>
              <FormControl>
                <Input type="password" placeholder="••••••••" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full mt-6" disabled={loginMutation.isPending}>
          {loginMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Log In
        </Button>
      </form>
    </Form>
  );
}

function SignupForm({ onSuccess }: { onSuccess: () => Promise<void> }) {
  const { toast } = useToast();
  const signupMutation = useBusinessSignup();

  const form = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "" },
  });

  const onSubmit = async (data: SignupFormValues) => {
    try {
      await signupMutation.mutateAsync({
        data: {
          email: data.email,
          password: data.password,
          firstName: data.firstName,
          lastName: data.lastName || null,
        },
      });
      toast({ title: "Account created", description: "Welcome to the directory." });
      await onSuccess();
    } catch (error: any) {
      toast({
        title: "Sign up failed",
        description: error?.message || "Could not create your account.",
        variant: "destructive",
      });
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FormField
            control={form.control}
            name="firstName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>First name</FormLabel>
                <FormControl>
                  <Input placeholder="Jane" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="lastName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Last name</FormLabel>
                <FormControl>
                  <Input placeholder="Doe" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input placeholder="you@example.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input type="password" placeholder="At least 8 characters" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full mt-6" disabled={signupMutation.isPending}>
          {signupMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Create Account
        </Button>
      </form>
    </Form>
  );
}

export default function BusinessLoginPage() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login");
  const { refetch } = useGetCurrentAuthUser({ query: { enabled: false } });

  const afterAuth = async () => {
    await refetch();
    setLocation(getReturnTo());
  };

  const isForgot = mode === "forgot";

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <Card className="w-full max-w-md shadow-lg border-0 dark:border dark:border-gray-800">
        <CardHeader className="space-y-1 text-center pb-4">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">Business Account</CardTitle>
          <CardDescription>
            {isForgot
              ? "Reset your password"
              : mode === "login"
              ? "Log in to manage your listing and plans"
              : "Create an account to claim your listing"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!isForgot && (
            <div className="grid grid-cols-2 rounded-lg bg-muted p-1 mb-6">
              <button
                type="button"
                onClick={() => setMode("login")}
                className={`rounded-md py-1.5 text-sm font-medium transition-all ${mode === "login" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Log In
              </button>
              <button
                type="button"
                onClick={() => setMode("signup")}
                className={`rounded-md py-1.5 text-sm font-medium transition-all ${mode === "signup" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
              >
                Sign Up
              </button>
            </div>
          )}

          {isForgot
            ? <ForgotPasswordView onBack={() => setMode("login")} />
            : mode === "login"
            ? <LoginForm onSuccess={afterAuth} onForgot={() => setMode("forgot")} />
            : <SignupForm onSuccess={afterAuth} />
          }
        </CardContent>
      </Card>
    </div>
  );
}
