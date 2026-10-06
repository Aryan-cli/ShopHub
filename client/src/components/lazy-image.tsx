import { useState, useRef, useEffect, memo } from "react";
import { cn } from "@/lib/utils";

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
  placeholderClassName?: string;
  width?: number;
  height?: number;
  onLoad?: () => void;
  onError?: () => void;
}

function LazyImageComponent({
  src,
  alt,
  className,
  placeholderClassName,
  width,
  height,
  onLoad,
  onError,
}: LazyImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const [hasError, setHasError] = useState(false);
  const imgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: "100px",
        threshold: 0.01,
      }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, []);

  const handleLoad = () => {
    setIsLoaded(true);
    onLoad?.();
  };

  const handleError = () => {
    setHasError(true);
    onError?.();
  };

  return (
    <div
      ref={imgRef}
      className={cn("relative overflow-hidden", className)}
      style={{ width, height }}
    >
      {!isLoaded && !hasError && (
        <div
          className={cn(
            "absolute inset-0 bg-muted animate-pulse",
            placeholderClassName
          )}
          data-testid="image-placeholder"
        />
      )}
      {hasError && (
        <div
          className="absolute inset-0 bg-muted flex items-center justify-center text-muted-foreground text-xs"
          data-testid="image-error"
        >
          Failed to load
        </div>
      )}
      {isInView && !hasError && (
        <img
          src={src}
          alt={alt}
          className={cn(
            "transition-opacity duration-300",
            isLoaded ? "opacity-100" : "opacity-0",
            className
          )}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onLoad={handleLoad}
          onError={handleError}
          loading="lazy"
          decoding="async"
          data-testid="lazy-image"
        />
      )}
    </div>
  );
}

export const LazyImage = memo(LazyImageComponent);
