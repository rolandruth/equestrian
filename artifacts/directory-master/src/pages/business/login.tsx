import { useState } from "react";
import { useLocation } from "wouter";
import { useBusinessLogin, useBusinessSignup, useGetCurrentAuthUser } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Building2 } from "lucide-react";
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

export default function BusinessLoginPage() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const { toast } = useToast();
  const { refetch } = useGetCurrentAuthUser({ query: { enabled: false } });

  const loginMutation = useBusinessLogin();
  const signupMutation = useBusinessSignup();

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const signupForm = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: { firstName: "", lastName: "", email: "", password: "" },
  });

  const afterAuth = async () => {
    await refetch();
    setLocation(getReturnTo());
  };

  const onLogin = async (data: LoginFormValues) => {
    try {
      await loginMutation.mutateAsync({ data });
      toast({ title: "Welcome back", description: "You have successfully logged in." });
      await afterAuth();
    } catch (error: any) {
      toast({
        title: "Login failed",
        description: error?.message || "Invalid email or password.",
        variant: "destructive",
      });
    }
  };

  const onSignup = async (data: SignupFormValues) => {
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
      await afterAuth();
    } catch (error: any) {
      toast({
        title: "Sign up failed",
        description: error?.message || "Could not create your account.",
        variant: "destructive",
      });
    }
  };

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
            {mode === "login"
              ? "Log in to manage your listing and plans"
              : "Create an account to claim your listing"}
          </CardDescription>
        </CardHeader>
        <CardContent>
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

          {mode === "login" ? (
            <Form {...loginForm}>
              <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                <FormField
                  control={loginForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="text" autoComplete="off" placeholder="you@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={loginForm.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="current-password" placeholder="••••••••" {...field} />
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
          ) : (
            <Form {...signupForm}>
              <form onSubmit={signupForm.handleSubmit(onSignup)} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <FormField
                    control={signupForm.control}
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
                    control={signupForm.control}
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
                  control={signupForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="text" autoComplete="off" placeholder="you@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={signupForm.control}
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}
