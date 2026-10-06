import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Star, Users } from "lucide-react";

interface DashboardStats {
  totalProducts: number;
  totalReviews: number;
  totalUsers: number;
  averageRating: number;
}

export default function AdminDashboard() {
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/admin/stats"],
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold" data-testid="text-admin-dashboard-title">
          Dashboard
        </h1>
        <p className="text-muted-foreground">
          Welcome to your store management dashboard
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Products</CardTitle>
            <Package className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-bold" data-testid="text-total-products">
                {stats?.totalProducts || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Reviews</CardTitle>
            <Star className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <>
                <div className="text-3xl font-bold" data-testid="text-total-reviews">
                  {stats?.totalReviews || 0}
                </div>
                <p className="text-xs text-muted-foreground">
                  Avg. rating: {(stats?.averageRating || 0).toFixed(1)} / 5
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Link href="/admin/users">
          <Card className="cursor-pointer hover-elevate active-elevate-2" data-testid="card-total-users">
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Users</CardTitle>
              <Users className="h-5 w-5 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-3xl font-bold" data-testid="text-total-users">
                  {stats?.totalUsers || 0}
                </div>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 p-2 rounded-md">
              <Package className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium">Add Products</p>
              <p className="text-sm text-muted-foreground">
                Go to Products to add new items to your store
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="bg-primary/10 p-2 rounded-md">
              <Star className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium">Monitor Reviews</p>
              <p className="text-sm text-muted-foreground">
                Customer reviews appear on each product page
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
