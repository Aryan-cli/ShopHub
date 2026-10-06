import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Navbar } from "@/components/navbar";
import { ProductCard } from "@/components/product-card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/lib/auth";
import { Heart } from "lucide-react";
import type { Product } from "@shared/schema";

interface ProductWithRatings extends Product {
  averageRating: number;
  reviewCount: number;
}

export default function Favorites() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const { data: favorites, isLoading } = useQuery<ProductWithRatings[]>({
    queryKey: ["/api/favorites"],
    enabled: !!user,
  });

  if (!user) {
    setLocation("/login");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container px-4 md:px-8 py-8">
        <h1 className="text-3xl font-bold mb-8" data-testid="text-page-title">My Favorites</h1>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="aspect-square" />
            ))}
          </div>
        ) : favorites && favorites.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {favorites.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                averageRating={product.averageRating}
                reviewCount={product.reviewCount}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-muted rounded-full p-6 mb-4">
              <Heart className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">No favorites yet</h2>
            <p className="text-muted-foreground max-w-md">
              Start browsing products and add them to your favorites
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
