import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "./star-rating";
import { Package } from "lucide-react";
import type { Product } from "@shared/schema";

interface ProductCardProps {
  product: Product;
  averageRating?: number;
  reviewCount?: number;
}

export function ProductCard({ product, averageRating = 0, reviewCount = 0 }: ProductCardProps) {
  const isOutOfStock = product.stockQuantity !== null && product.stockQuantity !== undefined && product.stockQuantity <= 0;

  return (
    <Link href={`/product/${product.id}`}>
      <Card
        className="overflow-visible hover-elevate active-elevate-2 cursor-pointer transition-all duration-200"
        data-testid={`card-product-${product.id}`}
      >
        <div className="relative aspect-square w-full overflow-hidden rounded-t-md bg-black flex items-center justify-center">
          {product.imageData ? (
            <img
              src={product.imageData}
              alt={product.name}
              className={`h-full w-full object-contain ${isOutOfStock ? "opacity-50" : ""}`}
              data-testid={`img-product-${product.id}`}
            />
          ) : (
            <Package className={`h-16 w-16 ${isOutOfStock ? "text-muted-foreground/20" : "text-muted-foreground/40"}`} />
          )}
          {isOutOfStock && (
            <div className="absolute inset-0 flex items-center justify-center">
              <Badge variant="destructive" className="text-sm font-semibold px-3 py-1" data-testid={`badge-out-of-stock-${product.id}`}>
                Out of Stock
              </Badge>
            </div>
          )}
        </div>
        <CardContent className="p-4 space-y-2">
          <h3 className="font-semibold text-lg line-clamp-1" data-testid={`text-product-name-${product.id}`}>
            {product.name}
          </h3>
          <p className="text-muted-foreground text-sm line-clamp-2">
            {product.description}
          </p>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xl font-bold" data-testid={`text-product-price-${product.id}`}>
              ${Number(product.price).toFixed(2)}
            </span>
            <div className="flex items-center gap-1">
              <StarRating rating={Math.round(averageRating)} size="sm" />
              <span className="text-xs text-muted-foreground">({reviewCount})</span>
            </div>
          </div>
          {product.stockQuantity !== null && product.stockQuantity !== undefined && product.stockQuantity > 0 && (
            <p className="text-xs text-muted-foreground" data-testid={`text-stock-${product.id}`}>
              {product.stockQuantity} in stock
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
