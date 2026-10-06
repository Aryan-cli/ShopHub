import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, TrendingUp, Star, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface SliderProduct {
  id: string;
  name: string;
  description: string;
  price: string;
  imageData: string | null;
  imageType: string | null;
  images: string[] | null;
  viewCount: number;
  averageRating: number;
  reviewCount: number;
}

interface BannerSliderData {
  products: SliderProduct[];
  settings: {
    refreshIntervalHours: number;
    lastRefreshedAt: string;
  };
}

export function BannerSlider() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);
  const autoPlayRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery<BannerSliderData>({
    queryKey: ["/api/banner-slider"],
    queryFn: async () => {
      const res = await fetch("/api/banner-slider", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch banner slider");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const products = data?.products ?? [];

  const goNext = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % Math.max(products.length, 1));
  }, [products.length]);

  const goPrev = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + Math.max(products.length, 1)) % Math.max(products.length, 1));
  }, [products.length]);

  useEffect(() => {
    if (!isAutoPlaying || products.length <= 1) return;
    autoPlayRef.current = setInterval(goNext, 4000);
    return () => {
      if (autoPlayRef.current) clearInterval(autoPlayRef.current);
    };
  }, [isAutoPlaying, goNext, products.length]);

  const handleMouseEnter = () => setIsAutoPlaying(false);
  const handleMouseLeave = () => setIsAutoPlaying(true);

  if (isLoading) {
    return (
      <div className="w-full h-64 md:h-80 lg:h-96 rounded-xl overflow-hidden">
        <Skeleton className="w-full h-full" />
      </div>
    );
  }

  if (!products.length) return null;

  const product = products[currentIndex];

  const getImageSrc = (p: SliderProduct) => {
    if (p.images && p.images.length > 0) return p.images[0];
    if (p.imageData) return p.imageData;
    return null;
  };

  const imageSrc = getImageSrc(product);

  return (
    <div
      className="relative w-full h-64 md:h-80 lg:h-96 rounded-xl overflow-hidden group cursor-pointer select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      data-testid="banner-slider"
    >
      <div className="absolute inset-0 transition-all duration-700 ease-in-out">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={product.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-primary/20 via-primary/10 to-background flex items-center justify-center">
            <TrendingUp className="h-20 w-20 text-primary/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
      </div>

      <div
        className="absolute bottom-0 left-0 right-0 p-5 md:p-7 text-white"
        onClick={() => setLocation(`/product/${product.id}`)}
      >
        <div className="flex items-center gap-2 mb-2">
          <Badge className="bg-primary text-primary-foreground text-xs px-2 py-0.5 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            Trending #{currentIndex + 1}
          </Badge>
          {product.averageRating > 0 && (
            <Badge variant="secondary" className="text-xs px-2 py-0.5 flex items-center gap-1 bg-white/20 text-white border-0">
              <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
              {product.averageRating.toFixed(1)} ({product.reviewCount})
            </Badge>
          )}
          <Badge variant="secondary" className="text-xs px-2 py-0.5 flex items-center gap-1 bg-white/20 text-white border-0">
            <Eye className="h-3 w-3" />
            {product.viewCount.toLocaleString()}
          </Badge>
        </div>
        <h2 className="text-xl md:text-2xl lg:text-3xl font-bold leading-tight mb-1 line-clamp-2">
          {product.name}
        </h2>
        <p className="text-white/70 text-sm line-clamp-1 mb-2">{product.description}</p>
        <div className="flex items-center justify-between">
          <span className="text-2xl font-bold text-white">${Number(product.price).toFixed(2)}</span>
          <Button
            size="sm"
            className="bg-white text-black hover:bg-white/90 font-semibold"
            onClick={(e) => {
              e.stopPropagation();
              setLocation(`/product/${product.id}`);
            }}
            data-testid={`button-slider-view-${product.id}`}
          >
            View Product
          </Button>
        </div>
      </div>

      {products.length > 1 && (
        <>
          <button
            className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            data-testid="button-slider-prev"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-2 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            data-testid="button-slider-next"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
            {products.map((_, i) => (
              <button
                key={i}
                className={`h-1.5 rounded-full transition-all ${i === currentIndex ? "w-6 bg-white" : "w-1.5 bg-white/50"}`}
                onClick={(e) => { e.stopPropagation(); setCurrentIndex(i); }}
                data-testid={`button-slider-dot-${i}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
