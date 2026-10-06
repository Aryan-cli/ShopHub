import { useState, useEffect, useCallback, useRef, memo } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Navbar } from "@/components/navbar";
import { ProductCard } from "@/components/product-card";
import { BannerSlider } from "@/components/banner-slider";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Package, Search, TrendingUp, Home as HomeIcon, Star, Eye, Loader2 } from "lucide-react";
import type { Product, Review } from "@shared/schema";

interface ProductWithRatings extends Product {
  averageRating: number;
  reviewCount: number;
}

interface ProductsResponse {
  products: ProductWithRatings[];
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
    hasMore: boolean;
  };
}

const MemoizedProductCard = memo(ProductCard);

const trendingTags = [
  { tag: "home", label: "Home Picks" },
  { tag: "popular", label: "Popular" },
  { tag: "top-rated", label: "Top Rated" },
  { tag: "most-viewed", label: "Most Viewed" },
];

export default function Home() {
  const [location] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSort, setActiveSort] = useState("home");
  const observerRef = useRef<HTMLDivElement>(null);
  
  const urlParams = new URLSearchParams(location.split("?")[1] || "");
  const urlSearch = urlParams.get("search") || "";
  
  useEffect(() => {
    setSearchQuery(urlSearch);
  }, [urlSearch]);
  
  const effectiveSearch = searchQuery;
  
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery<ProductsResponse>({
    queryKey: ["/api/products", effectiveSearch, activeSort],
    queryFn: async ({ pageParam = 1 }) => {
      const params = new URLSearchParams();
      if (effectiveSearch) params.append("search", effectiveSearch);
      if (activeSort) params.append("sort", activeSort);
      params.append("page", String(pageParam));
      params.append("limit", "20");
      const res = await fetch(`/api/products?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch products");
      return res.json();
    },
    getNextPageParam: (lastPage) => 
      lastPage.pagination.hasMore ? lastPage.pagination.page + 1 : undefined,
    initialPageParam: 1,
    staleTime: 10000,
  });

  const products = data?.pages.flatMap(page => page.products) ?? [];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );

    if (observerRef.current) {
      observer.observe(observerRef.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const handleTagClick = (tag: string) => {
    if (tag === "home") setActiveSort("home");
    else if (tag === "popular") setActiveSort("popular");
    else if (tag === "top-rated") setActiveSort("top-rated");
    else if (tag === "most-viewed") setActiveSort("most-viewed");
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <main className="container px-4 md:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl md:text-4xl font-bold mb-2" data-testid="text-page-title">
            Welcome to ShopHub
          </h1>
          <p className="text-muted-foreground text-lg">
            Discover amazing products at great prices
          </p>
        </div>

        <div className="mb-8">
          <BannerSlider />
        </div>

        <div className="mb-6 space-y-4">
          <form onSubmit={handleSearch} className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search products by name, description, or tags..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              data-testid="input-home-search"
            />
          </form>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground mr-2">Trending:</span>
            {trendingTags.map((item) => (
              <Badge
                key={item.tag}
                variant={activeSort === item.tag ? "default" : "secondary"}
                className="cursor-pointer"
                onClick={() => handleTagClick(item.tag)}
                data-testid={`tag-${item.tag}`}
              >
                #{item.label}
              </Badge>
            ))}
          </div>

          <Tabs value={activeSort} onValueChange={setActiveSort} className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-4">
              <TabsTrigger value="home" className="gap-1" data-testid="tab-home">
                <HomeIcon className="h-3 w-3" />
                <span className="hidden sm:inline">Home</span>
              </TabsTrigger>
              <TabsTrigger value="popular" className="gap-1" data-testid="tab-popular">
                <TrendingUp className="h-3 w-3" />
                <span className="hidden sm:inline">Popular</span>
              </TabsTrigger>
              <TabsTrigger value="top-rated" className="gap-1" data-testid="tab-top-rated">
                <Star className="h-3 w-3" />
                <span className="hidden sm:inline">Top Rated</span>
              </TabsTrigger>
              <TabsTrigger value="most-viewed" className="gap-1" data-testid="tab-most-viewed">
                <Eye className="h-3 w-3" />
                <span className="hidden sm:inline">Most Viewed</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-4">
                <Skeleton className="aspect-square w-full rounded-md" />
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        ) : products && products.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {products.map((product) => (
                <MemoizedProductCard
                  key={product.id}
                  product={product}
                  averageRating={product.averageRating}
                  reviewCount={product.reviewCount}
                />
              ))}
            </div>
            
            <div ref={observerRef} className="flex justify-center py-8">
              {isFetchingNextPage && (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" data-testid="loading-more" />
              )}
              {hasNextPage && !isFetchingNextPage && (
                <Button
                  variant="outline"
                  onClick={() => fetchNextPage()}
                  data-testid="button-load-more"
                >
                  Load More Products
                </Button>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="bg-muted rounded-full p-6 mb-4">
              <Package className="h-12 w-12 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-semibold mb-2">No products yet</h2>
            <p className="text-muted-foreground max-w-md">
              Products will appear here once the admin adds them. Check back soon!
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
