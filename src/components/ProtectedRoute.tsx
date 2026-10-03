import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { loading, userId, error } = useAuth();

  if (error) return <div role="alert" className="p-8">Unable to check your session. <button onClick={() => window.location.reload()}>Retry</button></div>;

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="container max-w-2xl mx-auto space-y-4">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!userId) {
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};
